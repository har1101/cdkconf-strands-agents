import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3_cloudfront from '@aws-solutions-constructs/aws-cloudfront-s3';
import * as waf_cloudfront from '@aws-solutions-constructs/aws-wafwebacl-cloudfront';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';

export class FrontendConstruct extends Construct {
  public readonly distribution: cloudfront.Distribution;
  public readonly bucket: cdk.aws_s3.Bucket;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const cloudfrontToS3 = new s3_cloudfront.CloudFrontToS3(this, 'CloudFrontToS3', {
      bucketProps: {
        bucketName: `strands-agents-frontend-${cdk.Stack.of(this).account}-${cdk.Stack.of(this).region}`,
        blockPublicAccess: cdk.aws_s3.BlockPublicAccess.BLOCK_ALL,
        encryption: cdk.aws_s3.BucketEncryption.S3_MANAGED,
        enforceSSL: true,
        versioned: true,
        lifecycleRules: [{
          noncurrentVersionExpiration: cdk.Duration.days(30)
        }],
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        autoDeleteObjects: true
      },
      cloudFrontDistributionProps: {
        comment: 'Strands Agents Well-Architected Review Frontend',
        defaultRootObject: 'index.html',
        errorResponses: [
          {
            httpStatus: 403,
            responseHttpStatus: 200,
            responsePagePath: '/index.html',
            ttl: cdk.Duration.seconds(0)
          },
          {
            httpStatus: 404,
            responseHttpStatus: 200,
            responsePagePath: '/index.html',
            ttl: cdk.Duration.seconds(0)
          }
        ],
        priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
        minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
        defaultBehavior: {
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          compress: true,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD
        }
      },
      insertHttpSecurityHeaders: true
    });

    this.distribution = cloudfrontToS3.cloudFrontWebDistribution;
    this.bucket = cloudfrontToS3.s3Bucket!;

    // WAF for CloudFront requires us-east-1 region - skip for demo in other regions
    // Production deployments should use cross-region stack for WAF
    const currentRegion = cdk.Stack.of(this).region;
    
    if (currentRegion === 'us-east-1') {
      const webAcl = new wafv2.CfnWebACL(this, 'WebACL', {
        scope: 'CLOUDFRONT',
        defaultAction: { allow: {} },
        rules: [
          {
            name: 'RateLimitRule',
            priority: 1,
            statement: {
              rateBasedStatement: {
                limit: 2000,
                aggregateKeyType: 'IP'
              }
            },
            action: { block: {} },
            visibilityConfig: {
              sampledRequestsEnabled: true,
              cloudWatchMetricsEnabled: true,
              metricName: 'RateLimitRule'
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
          metricName: 'StrandsAgentsWebACL'
        }
      });

      const cfnDistribution = this.distribution.node.defaultChild as cloudfront.CfnDistribution;
      cfnDistribution.addPropertyOverride('DistributionConfig.WebACLId', webAcl.attrArn);
    }
  }
}