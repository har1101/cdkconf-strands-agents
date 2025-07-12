import json
import os
import uuid
from datetime import datetime
import boto3
from aws_lambda_powertools import Logger, Tracer, Metrics
from aws_lambda_powertools.metrics import MetricUnit
from aws_lambda_powertools.logging import correlation_paths

logger = Logger()
tracer = Tracer()
metrics = Metrics()

dynamodb = boto3.resource('dynamodb')
sqs = boto3.client('sqs')

TABLE_NAME = os.environ['DYNAMODB_TABLE_NAME']
QUEUE_URL = os.environ['SQS_QUEUE_URL']
REGION = os.environ['REGION']

table = dynamodb.Table(TABLE_NAME)

@tracer.capture_lambda_handler
@logger.inject_lambda_context(correlation_id_path=correlation_paths.API_GATEWAY_REST)
@metrics.log_metrics
def handler(event, context):
    try:
        http_method = event['httpMethod']
        resource = event['resource']
        path_parameters = event.get('pathParameters', {})
        
        if resource == '/health' and http_method == 'GET':
            return handle_health_check()
        elif resource == '/reviews' and http_method == 'POST':
            return handle_create_review(event)
        elif resource == '/reviews' and http_method == 'GET':
            return handle_list_reviews(event)
        elif resource == '/reviews/{reviewId}' and http_method == 'GET':
            return handle_get_review(path_parameters.get('reviewId'))
        else:
            return {
                'statusCode': 404,
                'headers': get_cors_headers(),
                'body': json.dumps({'error': 'Resource not found'})
            }
    
    except Exception as e:
        logger.error(f"Error processing request: {str(e)}")
        metrics.add_metric(name="APIErrors", unit=MetricUnit.Count, value=1)
        return {
            'statusCode': 500,
            'headers': get_cors_headers(),
            'body': json.dumps({'error': 'Internal server error'})
        }

def get_cors_headers():
    return {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
    }

def handle_health_check():
    return {
        'statusCode': 200,
        'headers': get_cors_headers(),
        'body': json.dumps({
            'status': 'healthy',
            'timestamp': datetime.utcnow().isoformat(),
            'service': 'strands-agents-api'
        })
    }

@tracer.capture_method
def handle_create_review(event):
    try:
        body = json.loads(event['body'])
        
        review_id = str(uuid.uuid4())
        timestamp = datetime.utcnow().isoformat()
        
        aws_account_id = body.get('awsAccountId')
        region = body.get('region', REGION)
        pillars = body.get('pillars', ['all'])
        
        if not aws_account_id:
            return {
                'statusCode': 400,
                'headers': get_cors_headers(),
                'body': json.dumps({'error': 'awsAccountId is required'})
            }
        
        review_item = {
            'reviewId': review_id,
            'timestamp': timestamp,
            'status': 'PENDING',
            'awsAccountId': aws_account_id,
            'region': region,
            'pillars': pillars,
            'createdAt': timestamp,
            'updatedAt': timestamp
        }
        
        table.put_item(Item=review_item)
        
        queue_message = {
            'reviewId': review_id,
            'awsAccountId': aws_account_id,
            'region': region,
            'pillars': pillars,
            'timestamp': timestamp
        }
        
        sqs.send_message(
            QueueUrl=QUEUE_URL,
            MessageBody=json.dumps(queue_message),
            MessageAttributes={
                'reviewId': {
                    'StringValue': review_id,
                    'DataType': 'String'
                }
            }
        )
        
        logger.info(f"Created review {review_id} for account {aws_account_id}")
        metrics.add_metric(name="ReviewsCreated", unit=MetricUnit.Count, value=1)
        
        return {
            'statusCode': 201,
            'headers': get_cors_headers(),
            'body': json.dumps({
                'reviewId': review_id,
                'status': 'PENDING',
                'message': 'Review initiated successfully'
            })
        }
        
    except json.JSONDecodeError:
        return {
            'statusCode': 400,
            'headers': get_cors_headers(),
            'body': json.dumps({'error': 'Invalid JSON in request body'})
        }
    except Exception as e:
        logger.error(f"Error creating review: {str(e)}")
        return {
            'statusCode': 500,
            'headers': get_cors_headers(),
            'body': json.dumps({'error': 'Failed to create review'})
        }

@tracer.capture_method
def handle_get_review(review_id):
    if not review_id:
        return {
            'statusCode': 400,
            'headers': get_cors_headers(),
            'body': json.dumps({'error': 'reviewId is required'})
        }
    
    try:
        response = table.query(
            KeyConditionExpression='reviewId = :reviewId',
            ExpressionAttributeValues={':reviewId': review_id},
            ScanIndexForward=False,
            Limit=1
        )
        
        if not response['Items']:
            return {
                'statusCode': 404,
                'headers': get_cors_headers(),
                'body': json.dumps({'error': 'Review not found'})
            }
        
        review = response['Items'][0]
        
        return {
            'statusCode': 200,
            'headers': get_cors_headers(),
            'body': json.dumps(review, default=str)
        }
        
    except Exception as e:
        logger.error(f"Error getting review {review_id}: {str(e)}")
        return {
            'statusCode': 500,
            'headers': get_cors_headers(),
            'body': json.dumps({'error': 'Failed to get review'})
        }

@tracer.capture_method
def handle_list_reviews(event):
    try:
        query_params = event.get('queryStringParameters', {}) or {}
        limit = int(query_params.get('limit', 20))
        next_token = query_params.get('nextToken')
        
        scan_kwargs = {
            'Limit': limit
        }
        
        if next_token:
            scan_kwargs['ExclusiveStartKey'] = json.loads(next_token)
        
        response = table.scan(**scan_kwargs)
        
        result = {
            'items': response['Items'],
            'count': len(response['Items'])
        }
        
        if 'LastEvaluatedKey' in response:
            result['nextToken'] = json.dumps(response['LastEvaluatedKey'], default=str)
        
        return {
            'statusCode': 200,
            'headers': get_cors_headers(),
            'body': json.dumps(result, default=str)
        }
        
    except Exception as e:
        logger.error(f"Error listing reviews: {str(e)}")
        return {
            'statusCode': 500,
            'headers': get_cors_headers(),
            'body': json.dumps({'error': 'Failed to list reviews'})
        }