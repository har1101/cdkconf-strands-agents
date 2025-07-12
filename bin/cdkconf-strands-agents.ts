#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';
import { StrandsAgentsWellArchitectedStack } from '../lib/stacks/strands-agents-stack';

const app = new cdk.App();

const stack = new StrandsAgentsWellArchitectedStack(app, 'StrandsAgentsWellArchitectedStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1'
  },
  description: 'AWS Well-Architected Review AI Agent powered by Strands Agents SDK'
});

cdk.Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));