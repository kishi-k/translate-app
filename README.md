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

You can deploy the application with AWS credentials as parameters:

```bash
cdk deploy --context aws-access-key-id=YOUR_ACCESS_KEY_ID --context aws-secret-access-key=YOUR_SECRET_ACCESS_KEY
```

Alternatively, if you prefer not to pass credentials on the command line, you can omit them and you'll be prompted during deployment:

```bash
cdk deploy
```

This command will:
- Build a Docker image from your Streamlit application
- Push the image to Amazon ECR
- Create all necessary AWS resources (VPC, ECS Cluster, Fargate Service, etc.)
- Create a secret in AWS Secrets Manager to store the AWS credentials
- Deploy the application

After deployment completes, the CDK will output the URL of your Streamlit application.


## AWS Bedrock Configuration

The application uses AWS Bedrock for AI capabilities. The CDK stack sets up the necessary IAM permissions and VPC endpoints for secure access to Bedrock.

The application now uses environment variables for AWS credentials, which are securely stored in AWS Secrets Manager. During deployment, you can provide these credentials as parameters to the CDK command. The credentials are then:

1. Stored securely in AWS Secrets Manager
2. Made available to the container as environment variables
3. Used by the application to authenticate with AWS Bedrock

This approach is more secure than hardcoding credentials or using profile files, which aren't available in container environments.

## Auto-scaling Configuration

The application is configured to auto-scale based on CPU utilization:
- Minimum capacity: 1 task
- Maximum capacity: 3 tasks
- Scale up when CPU utilization exceeds 70%


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
