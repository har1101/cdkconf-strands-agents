import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as sqs_lambda from '@aws-solutions-constructs/aws-sqs-lambda';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';

export interface AsyncProcessingConstructProps {
  sqsQueue: sqs.Queue;
  dynamodbTable: dynamodb.Table;
  aiAgentFunction: lambda.Function;
}

export class AsyncProcessingConstruct extends Construct {
  public readonly processingFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: AsyncProcessingConstructProps) {
    super(scope, id);

    const environment = {
      DYNAMODB_TABLE_NAME: props.dynamodbTable.tableName,
      AI_AGENT_FUNCTION_NAME: props.aiAgentFunction.functionName,
      REGION: cdk.Stack.of(this).region
    };

    const sqsToLambda = new sqs_lambda.SqsToLambda(this, 'SqsToLambda', {
      existingQueueObj: props.sqsQueue,
      lambdaFunctionProps: {
        functionName: 'strands-agents-async-processor',
        runtime: lambda.Runtime.PYTHON_3_12,
        code: lambda.Code.fromAsset('lambda/async-processor'),
        handler: 'main.handler',
        timeout: cdk.Duration.minutes(15),
        environment: environment,
        memorySize: 512,
        architecture: lambda.Architecture.ARM_64,
        tracing: lambda.Tracing.ACTIVE,
        // Reserved concurrency removed to avoid account limits in demo environment
      },
      sqsEventSourceProps: {
        batchSize: 1,
        maxBatchingWindow: cdk.Duration.seconds(5),
        reportBatchItemFailures: true
      }
    });

    this.processingFunction = sqsToLambda.lambdaFunction;

    props.dynamodbTable.grantReadWriteData(this.processingFunction);

    this.processingFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'lambda:InvokeFunction'
      ],
      resources: [props.aiAgentFunction.functionArn]
    }));

    this.processingFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'xray:PutTraceSegments',
        'xray:PutTelemetryRecords'
      ],
      resources: ['*']
    }));

    this.processingFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'appsync:GraphQL'
      ],
      resources: [`arn:aws:appsync:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:apis/*/types/Mutation/*`]
    }));

    // Log permissions are handled by Solutions Construct automatically

    // CloudWatch alarms will be created post-deployment to avoid circular dependencies
  }
}