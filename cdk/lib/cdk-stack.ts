import { Duration, Stack, StackProps, RemovalPolicy, CfnOutput } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecsp from 'aws-cdk-lib/aws-ecs-patterns';
import * as elb from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export class CdkStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

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
        'STREAMLIT_SERVER_PORT': '8501',
        'STREAMLIT_SERVER_ADDRESS': '0.0.0.0',
        'STREAMLIT_SERVER_HEADLESS': 'true',
        'STREAMLIT_SERVER_ENABLE_CORS': 'true'
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
      listenerPort: 8015,
      targetProtocol: elb.ApplicationProtocol.HTTP,
      assignPublicIp: true,
      healthCheckGracePeriod: Duration.seconds(60),
      taskSubnets: {
        subnetType: ec2.SubnetType.PUBLIC
      }
    });
    
    // Configure health check for target group
    fargateService.targetGroup.configureHealthCheck({
      path: '/',
      interval: Duration.seconds(60),
      timeout: Duration.seconds(5),
      healthyThresholdCount: 2,
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
    
    // Output the load balancer URL
    new CfnOutput(this, 'StreamlitAppUrl', {
      value: `http://${fargateService.loadBalancer.loadBalancerDnsName}:8015`,
      description: 'URL of the Streamlit application'
    });
  }
}
