import json
import os
from datetime import datetime
import boto3
from aws_lambda_powertools import Logger, Tracer, Metrics
from aws_lambda_powertools.metrics import MetricUnit

logger = Logger()
tracer = Tracer()
metrics = Metrics()

dynamodb = boto3.resource('dynamodb')
lambda_client = boto3.client('lambda')

TABLE_NAME = os.environ['DYNAMODB_TABLE_NAME']
AI_AGENT_FUNCTION_NAME = os.environ['AI_AGENT_FUNCTION_NAME']
REGION = os.environ['REGION']

table = dynamodb.Table(TABLE_NAME)

@tracer.capture_lambda_handler
@logger.inject_lambda_context
@metrics.log_metrics
def handler(event, context):
    """
    Process SQS messages to trigger AI agent reviews
    """
    successful_records = []
    failed_records = []
    
    for record in event['Records']:
        try:
            message_body = json.loads(record['body'])
            review_id = message_body['reviewId']
            
            logger.info(f"Processing review {review_id}")
            
            result = process_review_request(message_body)
            
            if result['success']:
                successful_records.append(record['messageId'])
                metrics.add_metric(name="ProcessedReviews", unit=MetricUnit.Count, value=1)
            else:
                failed_records.append({
                    'itemIdentifier': record['messageId']
                })
                logger.error(f"Failed to process review {review_id}: {result['error']}")
                metrics.add_metric(name="FailedReviews", unit=MetricUnit.Count, value=1)
                
        except Exception as e:
            logger.error(f"Error processing record {record['messageId']}: {str(e)}")
            failed_records.append({
                'itemIdentifier': record['messageId']
            })
            metrics.add_metric(name="ProcessingErrors", unit=MetricUnit.Count, value=1)
    
    response = {}
    if failed_records:
        response['batchItemFailures'] = failed_records
    
    logger.info(f"Processed {len(successful_records)} successful, {len(failed_records)} failed")
    
    return response

@tracer.capture_method
def process_review_request(message):
    """
    Process a single review request
    """
    try:
        review_id = message['reviewId']
        aws_account_id = message['awsAccountId']
        region = message['region']
        pillars = message.get('pillars', ['all'])
        
        update_review_status(review_id, 'IN_PROGRESS')
        
        agent_payload = {
            'reviewId': review_id,
            'awsAccountId': aws_account_id,
            'region': region,
            'pillars': pillars,
            'action': 'perform_well_architected_review'
        }
        
        response = lambda_client.invoke(
            FunctionName=AI_AGENT_FUNCTION_NAME,
            InvocationType='Event', 
            Payload=json.dumps(agent_payload)
        )
        
        if response['StatusCode'] == 202:
            logger.info(f"Successfully triggered AI agent for review {review_id}")
            return {'success': True}
        else:
            error_msg = f"AI agent invocation failed with status {response['StatusCode']}"
            update_review_status(review_id, 'FAILED', error_msg)
            return {'success': False, 'error': error_msg}
            
    except Exception as e:
        error_msg = f"Error processing review: {str(e)}"
        try:
            update_review_status(review_id, 'FAILED', error_msg)
        except:
            pass
        return {'success': False, 'error': error_msg}

@tracer.capture_method
def update_review_status(review_id, status, error_message=None):
    """
    Update review status in DynamoDB
    """
    try:
        update_expression = "SET #status = :status, #updatedAt = :updatedAt"
        expression_attribute_names = {
            '#status': 'status',
            '#updatedAt': 'updatedAt'
        }
        expression_attribute_values = {
            ':status': status,
            ':updatedAt': datetime.utcnow().isoformat()
        }
        
        if error_message:
            update_expression += ", #errorMessage = :errorMessage"
            expression_attribute_names['#errorMessage'] = 'errorMessage'
            expression_attribute_values[':errorMessage'] = error_message
        
        response = table.query(
            KeyConditionExpression='reviewId = :reviewId',
            ExpressionAttributeValues={':reviewId': review_id},
            ScanIndexForward=False,
            Limit=1
        )
        
        if response['Items']:
            item = response['Items'][0]
            table.update_item(
                Key={
                    'reviewId': review_id,
                    'timestamp': item['timestamp']
                },
                UpdateExpression=update_expression,
                ExpressionAttributeNames=expression_attribute_names,
                ExpressionAttributeValues=expression_attribute_values
            )
            logger.info(f"Updated review {review_id} status to {status}")
        else:
            logger.error(f"Review {review_id} not found for status update")
            
    except Exception as e:
        logger.error(f"Error updating review status: {str(e)}")
        raise