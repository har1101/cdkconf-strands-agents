import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as apigateway_lambda from '@aws-solutions-constructs/aws-apigateway-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';

export interface BackendApiConstructProps {
  sqsQueue: sqs.Queue;
  dynamodbTable: dynamodb.Table;
  cloudFrontDistribution: cloudfront.Distribution;
}

export class BackendApiConstruct extends Construct {
  public readonly api: apigateway.RestApi;
  public readonly lambda: lambda.Function;

  constructor(scope: Construct, id: string, props: BackendApiConstructProps) {
    super(scope, id);

    const environment = {
      SQS_QUEUE_URL: props.sqsQueue.queueUrl,
      DYNAMODB_TABLE_NAME: props.dynamodbTable.tableName,
      REGION: cdk.Stack.of(this).region
    };

    const apiGatewayToLambda = new apigateway_lambda.ApiGatewayToLambda(this, 'ApiGatewayToLambda', {
      lambdaFunctionProps: {
        functionName: 'strands-agents-api-handler',
        runtime: lambda.Runtime.PYTHON_3_12,
        code: lambda.Code.fromAsset('lambda/api-handler'),
        handler: 'main.handler',
        timeout: cdk.Duration.minutes(1),
        environment: environment,
        memorySize: 256,
        architecture: lambda.Architecture.ARM_64,
        deadLetterQueueEnabled: true,
        tracing: lambda.Tracing.ACTIVE,
        logRetention: cdk.aws_logs.RetentionDays.ONE_WEEK
      },
      apiGatewayProps: {
        proxy: false,
        restApiName: 'strands-agents-api',
        description: 'API for Strands Agents Well-Architected Review',
        defaultCorsPreflightOptions: {
          allowOrigins: [
            `https://${props.cloudFrontDistribution.distributionDomainName}`,
            'http://localhost:3000'
          ],
          allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
          allowHeaders: ['Content-Type', 'Authorization', 'X-Amz-Date', 'X-Api-Key', 'X-Amz-Security-Token']
        },
        deploy: true,
        deployOptions: {
          stageName: 'prod',
          throttle: {
            rateLimit: 100,
            burstLimit: 200
          },
          loggingLevel: apigateway.MethodLoggingLevel.INFO,
          dataTraceEnabled: true,
          metricsEnabled: true
        },
        endpointConfiguration: {
          types: [apigateway.EndpointType.REGIONAL]
        },
        minCompressionSize: cdk.Size.bytes(1024)
      }
    });

    this.api = apiGatewayToLambda.apiGateway;
    this.lambda = apiGatewayToLambda.lambdaFunction;

    props.sqsQueue.grantSendMessages(this.lambda);
    props.dynamodbTable.grantReadWriteData(this.lambda);

    this.lambda.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'xray:PutTraceSegments',
        'xray:PutTelemetryRecords'
      ],
      resources: ['*']
    }));

    const reviewsResource = this.api.root.addResource('reviews');
    reviewsResource.addMethod('POST');
    reviewsResource.addMethod('GET');

    const reviewResource = reviewsResource.addResource('{reviewId}');
    reviewResource.addMethod('GET');

    const healthResource = this.api.root.addResource('health');
    healthResource.addMethod('GET');

    new cdk.aws_wafv2.CfnWebACL(this, 'ApiWebACL', {
      scope: 'REGIONAL',
      defaultAction: { allow: {} },
      rules: [
        {
          name: 'RateLimitRule',
          priority: 1,
          statement: {
            rateBasedStatement: {
              limit: 500,
              aggregateKeyType: 'IP'
            }
          },
          action: { block: {} },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'ApiRateLimitRule'
          }
        },
        {
          name: 'AWSManagedRulesCommonRuleSet',
          priority: 2,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesCommonRuleSet'
            }
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'AWSManagedRulesCommonRuleSet'
          }
        }
      ],
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: 'StrandsAgentsApiWebACL'
      }
    });
  }
}