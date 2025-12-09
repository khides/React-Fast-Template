#!/usr/bin/env node
import 'dotenv/config';
import * as cdk from 'aws-cdk-lib';
import { NetworkStack } from '../lib/network-stack';
import { DatabaseStack } from '../lib/database-stack';
import { BackendStack } from '../lib/backend-stack';
import { FrontendStack } from '../lib/frontend-stack';

const app = new cdk.App();

// Environment configuration
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT || process.env.AWS_ACCOUNT_ID,
  region: process.env.CDK_DEFAULT_REGION || process.env.AWS_REGION || 'ap-northeast-1',
};

// Application configuration
const appName = app.node.tryGetContext('appName') || 'react-fast-app';
const stage = app.node.tryGetContext('stage') || 'dev';

// Create stacks
const networkStack = new NetworkStack(app, `${appName}-${stage}-network`, {
  env,
  appName,
  stage,
});

const databaseStack = new DatabaseStack(app, `${appName}-${stage}-database`, {
  env,
  appName,
  stage,
  vpc: networkStack.vpc,
});

const backendStack = new BackendStack(app, `${appName}-${stage}-backend`, {
  env,
  appName,
  stage,
  vpc: networkStack.vpc,
  databaseSecret: databaseStack.databaseSecret,
  databaseEndpoint: databaseStack.databaseEndpoint,
  databaseSecurityGroup: databaseStack.securityGroup,  // RDS SGを渡す
});

const frontendStack = new FrontendStack(app, `${appName}-${stage}-frontend`, {
  env,
  appName,
  stage,
  apiEndpoint: backendStack.apiEndpoint,  // Lambda Function URL → API Gateway endpoint
});

// Add dependencies
databaseStack.addDependency(networkStack);
backendStack.addDependency(databaseStack);
frontendStack.addDependency(backendStack);

// Add tags to all resources
cdk.Tags.of(app).add('Project', appName);
cdk.Tags.of(app).add('Environment', stage);
