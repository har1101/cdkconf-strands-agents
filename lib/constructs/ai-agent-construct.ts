import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import { bedrock } from '@cdklabs/generative-ai-cdk-constructs';

export interface AiAgentConstructProps {
  dynamodbTable: dynamodb.Table;
}

export class AiAgentConstruct extends Construct {
  public readonly agentFunction: lambda.Function;
  public readonly bedrockAgent: bedrock.Agent;
  public readonly knowledgeBase: bedrock.VectorKnowledgeBase;

  constructor(scope: Construct, id: string, props: AiAgentConstructProps) {
    super(scope, id);

    const agentKnowledgeBucket = new cdk.aws_s3.Bucket(this, 'AgentKnowledgeBucket', {
      bucketName: `strands-agents-knowledge-${cdk.Stack.of(this).account}-${cdk.Stack.of(this).region}`,
      blockPublicAccess: cdk.aws_s3.BlockPublicAccess.BLOCK_ALL,
      encryption: cdk.aws_s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      lifecycleRules: [{
        noncurrentVersionExpiration: cdk.Duration.days(30)
      }],
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true
    });

    // Knowledge Base creation will be done manually or in a separate stack
    // due to Docker dependency in CDK synthesis
    this.knowledgeBase = undefined as any;

    const environment = {
      DYNAMODB_TABLE_NAME: props.dynamodbTable.tableName,
      KNOWLEDGE_BASE_ID: 'manual-kb-id', // Will be set manually
      REGION: cdk.Stack.of(this).region,
      BEDROCK_MODEL_ID: 'us.anthropic.claude-3-7-sonnet-20250219-v1:0'
    };

    this.agentFunction = new lambda.Function(this, 'StrandsAgentFunction', {
      functionName: 'strands-agents-well-architected-agent',
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset('lambda/ai-agent'),
      handler: 'main.handler',
      timeout: cdk.Duration.minutes(15),
      environment: environment,
      memorySize: 1024,
      architecture: lambda.Architecture.ARM_64,
      tracing: lambda.Tracing.ACTIVE,
      logRetention: cdk.aws_logs.RetentionDays.ONE_WEEK,
      // Reserved concurrency removed to avoid account limits in demo environment
      layers: [
        new lambda.LayerVersion(this, 'StrandsAgentsLayer', {
          layerVersionName: 'strands-agents-layer',
          code: lambda.Code.fromAsset('lambda/layers/strands-agents'),
          compatibleRuntimes: [lambda.Runtime.PYTHON_3_12],
          compatibleArchitectures: [lambda.Architecture.ARM_64],
          description: 'Layer containing Strands Agents SDK and dependencies'
        })
      ]
    });

    props.dynamodbTable.grantReadWriteData(this.agentFunction);

    this.agentFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:InvokeModel',
        'bedrock:InvokeModelWithResponseStream',
        'bedrock:Retrieve',
        'bedrock:RetrieveAndGenerate'
      ],
      resources: [
        `arn:aws:bedrock:${cdk.Stack.of(this).region}::foundation-model/us.anthropic.claude-3-7-sonnet-20250219-v1:0`,
        `arn:aws:bedrock:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:knowledge-base/*`
      ]
    }));

    this.agentFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'support:DescribeCases',
        'support:DescribeServices',
        'support:DescribeSeverityLevels',
        'support:DescribeCommunications',
        'trustedadvisor:Describe*',
        'wellarchitected:GetWorkload',
        'wellarchitected:ListWorkloads',
        'wellarchitected:GetLensReview',
        'wellarchitected:ListLensReviews'
      ],
      resources: ['*']
    }));

    this.agentFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'iam:ListRoles',
        'iam:ListPolicies',
        'iam:GetRole',
        'iam:GetPolicy',
        'iam:ListAttachedRolePolicies',
        'ec2:DescribeInstances',
        'ec2:DescribeSecurityGroups',
        'ec2:DescribeVpcs',
        'ec2:DescribeSubnets',
        's3:ListAllMyBuckets',
        's3:GetBucketPolicy',
        's3:GetBucketEncryption',
        's3:GetBucketVersioning',
        'rds:DescribeDBInstances',
        'rds:DescribeDBClusters',
        'lambda:ListFunctions',
        'lambda:GetFunction',
        'cloudformation:DescribeStacks',
        'cloudformation:ListStackResources'
      ],
      resources: ['*']
    }));

    this.agentFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'xray:PutTraceSegments',
        'xray:PutTelemetryRecords'
      ],
      resources: ['*']
    }));

    this.bedrockAgent = new bedrock.Agent(this, 'WellArchitectedAgent', {
      name: 'well-architected-reviewer',
      foundationModel: bedrock.BedrockFoundationModel.ANTHROPIC_CLAUDE_3_7_SONNET_V1_0,
      instruction: `
        You are an AWS Well-Architected Framework expert assistant. Your role is to:
        
        1. Analyze AWS resources and infrastructure configurations
        2. Evaluate them against the 6 pillars of the Well-Architected Framework:
           - Operational Excellence
           - Security
           - Reliability
           - Performance Efficiency
           - Cost Optimization
           - Sustainability
        
        3. Provide specific recommendations for improvements
        4. Cite relevant AWS best practices and documentation
        5. Prioritize findings based on risk and impact
        
        Always provide actionable, specific recommendations with implementation guidance.
        Reference AWS documentation and best practices for your recommendations.
      `,
      description: 'AI agent for AWS Well-Architected Framework reviews',
      idleSessionTTL: cdk.Duration.minutes(30)
    });

    new cdk.aws_cloudwatch.Alarm(this, 'AgentFunctionErrorAlarm', {
      alarmName: 'StrandsAgents-AIAgent-Errors',
      metric: this.agentFunction.metricErrors({
        period: cdk.Duration.minutes(5)
      }),
      threshold: 1,
      evaluationPeriods: 1,
      alarmDescription: 'Alarm when AI agent function encounters errors'
    });

    new cdk.aws_cloudwatch.Alarm(this, 'AgentFunctionDurationAlarm', {
      alarmName: 'StrandsAgents-AIAgent-Duration',
      metric: this.agentFunction.metricDuration({
        period: cdk.Duration.minutes(5)
      }),
      threshold: 600000,
      evaluationPeriods: 2,
      alarmDescription: 'Alarm when AI agent function takes too long'
    });
  }
}