import { Duration, Stack, StackProps, RemovalPolicy, CfnOutput, CfnParameter } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecsp from 'aws-cdk-lib/aws-ecs-patterns';
import * as elb from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export interface CdkStackProps extends StackProps {
  awsAccessKeyId?: string;
  awsSecretAccessKey?: string;
}

export class CdkStack extends Stack {
  constructor(scope: Construct, id: string, props?: CdkStackProps) {
    super(scope, id, props);

    // Use either the parameters passed via props or the CloudFormation parameters
    const awsAccessKeyId = props?.awsAccessKeyId 
    const awsSecretAccessKey = props?.awsSecretAccessKey

    const vpc = new ec2.Vpc(this, 'vpc', {
      subnetConfiguration: [
        {
          name: 'public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          name: 'private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
      ],
      maxAzs: 4,
    })

    // Create a secret for AWS credentials using the provided parameters
    const awsCredentialsSecret = new secretsmanager.Secret(this, 'AWSCredentialsSecret', {
      secretName: 'transrate-app/aws-credentials',
      description: 'AWS credentials for the Transrate application',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          AWS_ACCESS_KEY_ID: awsAccessKeyId,
          AWS_SECRET_ACCESS_KEY: awsSecretAccessKey
        }),
        generateStringKey: 'password' // This key won't be used but is required
      }
    });

    const bedrockPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        "bedrock:*",
        "s3:*",
        "cloudwatch:*",
        "logs:*"
      ],
      resources: ["*"]
    });

    const ecrPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      resources: ['*'],
      actions: [
        "ecr:GetAuthorizationToken",
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ]
    });

    // Create policy to allow access to the secret
    const secretsPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        "secretsmanager:GetSecretValue",
        "secretsmanager:DescribeSecret"
      ],
      resources: [awsCredentialsSecret.secretArn]
    });

    // Create log group with retention
    const logGroup = new logs.LogGroup(this, 'StreamlitAppLogGroup', {
      logGroupName: '/ecs/streamlit-app',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY
    });

    // Create task definition
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'task-definition', {
      memoryLimitMiB: 2048,
      cpu: 1024,
      runtimePlatform: {
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
        cpuArchitecture: ecs.CpuArchitecture.ARM64,
      }
    });

    taskDefinition.addToExecutionRolePolicy(ecrPolicy)
    taskDefinition.addToExecutionRolePolicy(secretsPolicy) // Add permission to read secrets
    taskDefinition.addToTaskRolePolicy(bedrockPolicy)

    // Add container to task definition
    const container = taskDefinition.addContainer('streamlit-app-container', {
      image: ecs.ContainerImage.fromAsset('../app'),
      memoryLimitMiB: 2048,
      cpu: 1024,
      portMappings: [
        {
          containerPort: 8501,
          hostPort: 8501
        }
      ],
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'streamlit-app',
        logGroup: logGroup
      }),
      environment: {
        // Environment variables for the container
        'AWS_REGION': this.region,
        // 'STREAMLIT_SERVER_PORT': '8501',
        // 'STREAMLIT_SERVER_ADDRESS': '0.0.0.0',
        // 'STREAMLIT_SERVER_HEADLESS': 'true',
        // 'STREAMLIT_SERVER_ENABLE_CORS': 'true',
        // 'STREAMLIT_SERVER_ENABLE_WEBSOCKET': 'true',
        // 'STREAMLIT_SERVER_BASE_URL_PATH': '/',
        // 'STREAMLIT_BROWSER_GATHER_USAGE_STATS': 'false'
      },
      secrets: {
        // Map secrets from AWS Secrets Manager to environment variables
        'AWS_ACCESS_KEY_ID': ecs.Secret.fromSecretsManager(awsCredentialsSecret, 'AWS_ACCESS_KEY_ID'),
        'AWS_SECRET_ACCESS_KEY': ecs.Secret.fromSecretsManager(awsCredentialsSecret, 'AWS_SECRET_ACCESS_KEY')
      },
      healthCheck: {
        command: ["CMD-SHELL", "curl -f http://localhost:8501/ || exit 1"],
        interval: Duration.seconds(30),
        timeout: Duration.seconds(5),
        retries: 3,
        startPeriod: Duration.seconds(30)
      }
    });

    const cluster = new ecs.Cluster(this, 'cluster', {
      vpc: vpc,
      containerInsights: true,
    })


    vpc.addInterfaceEndpoint("bedrock-endpoint", {
      service:ec2.InterfaceVpcEndpointAwsService.BEDROCK_RUNTIME
    })


    // Create Fargate service with load balancer
    const fargateService = new ecsp.ApplicationLoadBalancedFargateService(this, 'streamlit-app', {
      cluster: cluster,
      taskDefinition: taskDefinition,
      desiredCount: 1,
      publicLoadBalancer: true,
      openListener: true,
      listenerPort: 80, // HTTP port
      targetProtocol: elb.ApplicationProtocol.HTTP,
      assignPublicIp: true,
      healthCheckGracePeriod: Duration.seconds(60),
      taskSubnets: {
        subnetType: ec2.SubnetType.PUBLIC
      },
      // certificate: certificate, // Add certificate for HTTPS
    });
    
    // Configure health check for target group
    fargateService.targetGroup.configureHealthCheck({
      path: '/',  // Streamlit health check endpoint
      interval: Duration.seconds(30),
      timeout: Duration.seconds(10),
      healthyThresholdCount: 3,
      unhealthyThresholdCount: 3
    });
    
    // Add auto-scaling
    const scaling = fargateService.service.autoScaleTaskCount({
      minCapacity: 1,
      maxCapacity: 3
    });
    
    scaling.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 70,
      scaleInCooldown: Duration.seconds(60),
      scaleOutCooldown: Duration.seconds(60)
    });
    
    // Create an S3 bucket for CloudFront logs
    const cloudfrontLogsBucket = new s3.Bucket(this, 'ApplicationAccessLogsBucket', {
      removalPolicy: RemovalPolicy.DESTROY, // For development; use RETAIN for production
      autoDeleteObjects: true, // For development; remove for production
      lifecycleRules: [
        {
          expiration: Duration.days(60), // Keep logs for 30 days
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: Duration.days(30)
            }
          ]
        }
      ],
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_PREFERRED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
    });

    // Use AWS managed policies for Streamlit compatibility
    // These are the same policies used in the reference Terraform implementation
    const cachingDisabledPolicy = cloudfront.CachePolicy.CACHING_DISABLED;
    const allViewerPolicy = cloudfront.OriginRequestPolicy.ALL_VIEWER;
    const simpleCorsPolicy = cloudfront.ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS;

    // Create CloudFront distribution with ALB as origin
    const distribution = new cloudfront.Distribution(this, 'CloudFrontDistribution', {
      defaultBehavior: {
        origin: new origins.LoadBalancerV2Origin(fargateService.loadBalancer, {
          protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
          httpPort: 80,
          httpsPort: 443,
          // Following the Terraform implementation for WebSocket support
          customHeaders: {
            // Add a custom header to identify requests from CloudFront
            'X-Custom-Header': 'cloudfront-request',
          },
          // Keep connection settings simple as in the Terraform implementation
          connectionAttempts: 3,
          connectionTimeout: Duration.seconds(10),
        }),
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cachingDisabledPolicy,
        originRequestPolicy: allViewerPolicy,
        responseHeadersPolicy: simpleCorsPolicy,
        compress: true,
      },
      // Enable logging to S3 bucket
      enableLogging: true,
      logBucket: cloudfrontLogsBucket,
      logFilePrefix: 'cloudfront-logs/',
      logIncludesCookies: true,
    });
    
    // Output the CloudFront URL
    new CfnOutput(this, 'CloudFrontUrl', {
      value: `https://${distribution.distributionDomainName}`,
      description: 'CloudFront URL for the Streamlit application'
    });
    
    // Output the ARN of the AWS credentials secret
    new CfnOutput(this, 'AWSCredentialsSecretArn', {
      value: awsCredentialsSecret.secretArn,
      description: 'ARN of the AWS credentials secret. Use this to update the secret with actual credentials.'
    });
    
    // Output the CloudFront logs bucket name
    new CfnOutput(this, 'CloudFrontLogsBucket', {
      value: cloudfrontLogsBucket.bucketName,
      description: 'S3 bucket containing CloudFront access logs'
    });
  }
}
