import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as appsync from 'aws-cdk-lib/aws-appsync';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';

export interface AppSyncConstructProps {
  dynamodbTable: dynamodb.Table;
}

export class AppSyncConstruct extends Construct {
  public readonly api: appsync.GraphqlApi;
  public readonly dataSource: appsync.DynamoDbDataSource;
  public readonly apiKey: string;

  constructor(scope: Construct, id: string, props: AppSyncConstructProps) {
    super(scope, id);

    const schema = `
      type Review {
        reviewId: String!
        timestamp: String!
        status: ReviewStatus!
        awsAccountId: String!
        region: String!
        pillar: String
        findings: [Finding]
        score: Float
        recommendations: [Recommendation]
        createdAt: String!
        updatedAt: String!
      }

      type Finding {
        id: String!
        pillar: String!
        title: String!
        description: String!
        severity: Severity!
        resourceArn: String
        service: String
      }

      type Recommendation {
        id: String!
        title: String!
        description: String!
        priority: Priority!
        effort: String!
        implementationGuide: String
        links: [String]
      }

      enum ReviewStatus {
        PENDING
        IN_PROGRESS
        COMPLETED
        FAILED
      }

      enum Severity {
        LOW
        MEDIUM
        HIGH
        CRITICAL
      }

      enum Priority {
        LOW
        MEDIUM
        HIGH
        CRITICAL
      }

      type Query {
        getReview(reviewId: String!): Review
        listReviews(limit: Int, nextToken: String): ReviewConnection
        getReviewsByStatus(status: ReviewStatus!, limit: Int, nextToken: String): ReviewConnection
      }

      type Mutation {
        updateReview(input: UpdateReviewInput!): Review
        updateReviewStatus(reviewId: String!, status: ReviewStatus!): Review
      }

      type Subscription {
        onReviewUpdated(reviewId: String): Review
          @aws_subscribe(mutations: ["updateReview", "updateReviewStatus"])
      }

      type ReviewConnection {
        items: [Review]
        nextToken: String
      }

      input UpdateReviewInput {
        reviewId: String!
        status: ReviewStatus
        findings: [FindingInput]
        score: Float
        recommendations: [RecommendationInput]
      }

      input FindingInput {
        id: String!
        pillar: String!
        title: String!
        description: String!
        severity: Severity!
        resourceArn: String
        service: String
      }

      input RecommendationInput {
        id: String!
        title: String!
        description: String!
        priority: Priority!
        effort: String!
        implementationGuide: String
        links: [String]
      }
    `;

    this.api = new appsync.GraphqlApi(this, 'Api', {
      name: 'strands-agents-well-architected-api',
      definition: appsync.Definition.fromSchema(appsync.SchemaFile.fromAsset('schema.graphql')),
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: appsync.AuthorizationType.API_KEY,
          apiKeyConfig: {
            description: 'Frontend API Key',
            expires: cdk.Expiration.after(cdk.Duration.days(365))
          }
        }
      },
      logConfig: {
        fieldLogLevel: appsync.FieldLogLevel.ALL,
        retention: cdk.aws_logs.RetentionDays.ONE_WEEK
      },
      xrayEnabled: true
    });

    // Get the API Key
    this.apiKey = this.api.apiKey!;

    this.dataSource = this.api.addDynamoDbDataSource('ReviewsDataSource', props.dynamodbTable, {
      description: 'DynamoDB data source for Well-Architected reviews'
    });

    this.dataSource.createResolver('GetReviewResolver', {
      typeName: 'Query',
      fieldName: 'getReview',
      requestMappingTemplate: appsync.MappingTemplate.dynamoDbGetItem('reviewId', 'timestamp'),
      responseMappingTemplate: appsync.MappingTemplate.dynamoDbResultItem()
    });

    this.dataSource.createResolver('ListReviewsResolver', {
      typeName: 'Query',
      fieldName: 'listReviews',
      requestMappingTemplate: appsync.MappingTemplate.fromString(`
        {
          "version": "2017-02-28",
          "operation": "Scan",
          "limit": $util.defaultIfNull($context.arguments.limit, 20),
          "nextToken": $util.toJson($util.defaultIfNullOrBlank($context.arguments.nextToken, null))
        }
      `),
      responseMappingTemplate: appsync.MappingTemplate.fromString(`
        {
          "items": $util.toJson($context.result.items),
          "nextToken": $util.toJson($util.defaultIfNullOrBlank($context.result.nextToken, null))
        }
      `)
    });

    this.dataSource.createResolver('UpdateReviewResolver', {
      typeName: 'Mutation',
      fieldName: 'updateReview',
      requestMappingTemplate: appsync.MappingTemplate.fromString(`
        {
          "version": "2017-02-28",
          "operation": "UpdateItem",
          "key": {
            "reviewId": $util.dynamodb.toDynamoDBJson($context.arguments.input.reviewId),
            "timestamp": $util.dynamodb.toDynamoDBJson($context.stash.timestamp)
          },
          "update": {
            "expression": "SET #updatedAt = :updatedAt",
            "expressionNames": {
              "#updatedAt": "updatedAt"
            },
            "expressionValues": {
              ":updatedAt": $util.dynamodb.toDynamoDBJson($util.time.nowISO8601())
            }
          }
        }
      `),
      responseMappingTemplate: appsync.MappingTemplate.dynamoDbResultItem()
    });

    this.dataSource.createResolver('UpdateReviewStatusResolver', {
      typeName: 'Mutation',
      fieldName: 'updateReviewStatus',
      requestMappingTemplate: appsync.MappingTemplate.fromString(`
        {
          "version": "2017-02-28",
          "operation": "UpdateItem",
          "key": {
            "reviewId": $util.dynamodb.toDynamoDBJson($context.arguments.reviewId),
            "timestamp": $util.dynamodb.toDynamoDBJson($context.stash.timestamp)
          },
          "update": {
            "expression": "SET #status = :status, #updatedAt = :updatedAt",
            "expressionNames": {
              "#status": "status",
              "#updatedAt": "updatedAt"
            },
            "expressionValues": {
              ":status": $util.dynamodb.toDynamoDBJson($context.arguments.status),
              ":updatedAt": $util.dynamodb.toDynamoDBJson($util.time.nowISO8601())
            }
          }
        }
      `),
      responseMappingTemplate: appsync.MappingTemplate.dynamoDbResultItem()
    });

    // API Key authentication - no IAM grants needed
  }
}