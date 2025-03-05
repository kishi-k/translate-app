# Streamlit Application Deployment on AWS ECS Fargate

This project contains a Streamlit application for language translation and review using AWS Bedrock, deployed on AWS ECS Fargate using AWS CDK.

## Architecture

The application architecture consists of:

- **Streamlit Application**: A Python web application that provides language translation and review capabilities using AWS Bedrock.
- **AWS ECS Fargate**: Serverless container orchestration service that runs the Streamlit application.
- **Application Load Balancer**: Distributes incoming traffic to the Fargate service.
- **VPC with Public and Private Subnets**: Network infrastructure for the application.
- **AWS Bedrock VPC Endpoint**: Secure connection to AWS Bedrock service.
- **CloudWatch Logs**: Logging for the application.
- **Auto Scaling**: Automatically adjusts capacity based on demand.

## Prerequisites

- AWS CLI installed and configured with appropriate permissions
- Node.js and npm installed
- AWS CDK installed (`npm install -g aws-cdk`)
- Docker installed and running
- AWS account with permissions to create resources (ECS, VPC, IAM, etc.)

## Deployment Steps

### 1. Configure AWS Credentials

Ensure your AWS credentials are properly configured:

```bash
aws configure
```

### 2. Install CDK Dependencies

```bash
cd cdk
npm install
```

### 3. Bootstrap CDK (if not already done)

```bash
cdk bootstrap
```

### 4. Deploy the Application

```bash
cdk deploy
```

This command will:
- Build a Docker image from your Streamlit application
- Push the image to Amazon ECR
- Create all necessary AWS resources (VPC, ECS Cluster, Fargate Service, etc.)
- Deploy the application

After deployment completes, the CDK will output the URL of your Streamlit application.

## Accessing the Application

After successful deployment, you can access your Streamlit application using the URL provided in the CDK output:

```
StreamlitAppUrl: http://your-load-balancer-url:8015
```

## AWS Bedrock Configuration

The application uses AWS Bedrock for AI capabilities. The CDK stack sets up the necessary IAM permissions and VPC endpoints for secure access to Bedrock.

By default, the application uses the AWS profile named 'default' for Bedrock access. If you need to use a different profile, update the `session = boto3.Session(profile_name='defalut')` line in `app/app.py`.

## Auto-scaling Configuration

The application is configured to auto-scale based on CPU utilization:
- Minimum capacity: 1 task
- Maximum capacity: 3 tasks
- Scale up when CPU utilization exceeds 70%

## Troubleshooting

### Common Issues

1. **Deployment Failure**: 
   - Check CloudFormation events in the AWS Console
   - Verify that your AWS account has sufficient permissions
   - Ensure Docker is running for image building

2. **Application Not Accessible**:
   - Check if the Fargate service is running in the ECS Console
   - Verify security group rules allow traffic on port 8015
   - Check the health check status in the target group

3. **Bedrock API Errors**:
   - Verify that your AWS credentials have access to Bedrock
   - Check that the VPC endpoint for Bedrock is properly configured
   - Ensure the region you're deploying to supports Bedrock

### Viewing Logs

You can view application logs in CloudWatch:

```bash
aws logs get-log-events --log-group-name /ecs/streamlit-app --log-stream-name <log-stream-name>
```

Or navigate to the CloudWatch Logs console and find the `/ecs/streamlit-app` log group.

## Cleaning Up

To avoid incurring charges, delete the resources when no longer needed:

```bash
cd cdk
cdk destroy
```

## Customization

- **Container Resources**: Adjust memory and CPU in the task definition in `cdk/lib/cdk-stack.ts`
- **Auto-scaling**: Modify scaling parameters in the `scaling.scaleOnCpuUtilization` section
- **Networking**: Update VPC configuration as needed for your security requirements
