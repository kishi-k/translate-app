#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { CdkStack } from '../lib/cdk-stack';

const app = new cdk.App();

// Get account and region from environment variables or use defaults
const account = process.env.CDK_DEFAULT_ACCOUNT || process.env.AWS_ACCOUNT_ID;
const region = process.env.CDK_DEFAULT_REGION || process.env.AWS_REGION || 'us-east-1';

// Get AWS credentials from context (passed via --context flag)
const awsAccessKeyId = app.node.tryGetContext('aws-access-key-id');
const awsSecretAccessKey = app.node.tryGetContext('aws-secret-access-key');

// Create the stack with environment and credentials specified
new CdkStack(app, 'CdkStack', {
  env: {
    account: account,
    region: region
  },
  awsAccessKeyId: awsAccessKeyId,
  awsSecretAccessKey: awsSecretAccessKey
});

// Output the account and region being used
console.log(`Deploying to account: ${account}, region: ${region}`);
console.log(`AWS credentials ${awsAccessKeyId ? 'provided' : 'will be prompted during deployment'}`);
