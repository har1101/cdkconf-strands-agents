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
TABLE_NAME = os.environ['DYNAMODB_TABLE_NAME']
KNOWLEDGE_BASE_ID = os.environ['KNOWLEDGE_BASE_ID']
BEDROCK_MODEL_ID = os.environ['BEDROCK_MODEL_ID']
REGION = os.environ['REGION']

table = dynamodb.Table(TABLE_NAME)

@tracer.capture_lambda_handler
@logger.inject_lambda_context
@metrics.log_metrics
def handler(event, context):
    """
    Main handler for AI agent processing using Strands Agents SDK
    """
    try:
        review_id = event['reviewId']
        aws_account_id = event['awsAccountId']
        region = event['region']
        pillars = event.get('pillars', ['all'])
        action = event.get('action', 'perform_well_architected_review')
        
        logger.info(f"Starting AI agent processing for review {review_id}")
        
        if action == 'perform_well_architected_review':
            result = perform_well_architected_review(
                review_id, aws_account_id, region, pillars
            )
        else:
            raise ValueError(f"Unknown action: {action}")
        
        if result['success']:
            metrics.add_metric(name="SuccessfulReviews", unit=MetricUnit.Count, value=1)
            logger.info(f"Successfully completed review {review_id}")
        else:
            metrics.add_metric(name="FailedReviews", unit=MetricUnit.Count, value=1)
            logger.error(f"Failed to complete review {review_id}: {result['error']}")
        
        return result
        
    except Exception as e:
        logger.error(f"Error in AI agent handler: {str(e)}")
        metrics.add_metric(name="HandlerErrors", unit=MetricUnit.Count, value=1)
        return {
            'success': False,
            'error': str(e)
        }

@tracer.capture_method
def perform_well_architected_review(review_id, aws_account_id, region, pillars):
    """
    Perform Well-Architected review using Strands Agents
    """
    try:
        from strands import Agent, tool
        from strands_tools import use_aws
        
        @tool
        def analyze_aws_resources(account_id: str, region: str) -> dict:
            """
            Analyze AWS resources in the specified account and region
            
            Args:
                account_id: AWS account ID to analyze
                region: AWS region to analyze
                
            Returns:
                dict: Analysis results with resource information
            """
            try:
                aws_analyzer = AWSResourceAnalyzer(account_id, region)
                return aws_analyzer.analyze_all_resources()
            except Exception as e:
                logger.error(f"Error analyzing AWS resources: {str(e)}")
                return {"error": str(e)}
        
        @tool
        def evaluate_well_architected_pillars(resources: dict, pillars: list) -> dict:
            """
            Evaluate resources against Well-Architected Framework pillars
            
            Args:
                resources: Resource analysis results
                pillars: List of pillars to evaluate
                
            Returns:
                dict: Evaluation results with findings and recommendations
            """
            try:
                evaluator = WellArchitectedEvaluator()
                return evaluator.evaluate(resources, pillars)
            except Exception as e:
                logger.error(f"Error evaluating Well-Architected pillars: {str(e)}")
                return {"error": str(e)}
        
        agent = Agent(
            model=BEDROCK_MODEL_ID,
            tools=[analyze_aws_resources, evaluate_well_architected_pillars, use_aws],
            system_prompt=f"""
            You are an AWS Well-Architected Framework expert. Your task is to:
            
            1. Analyze AWS resources in account {aws_account_id} in region {region}
            2. Evaluate them against the Well-Architected Framework pillars: {', '.join(pillars)}
            3. Provide specific findings and actionable recommendations
            4. Assign severity levels and implementation priorities
            
            Focus on the following pillars: {', '.join(pillars)}
            
            For each finding, include:
            - Specific AWS service and resource affected
            - Risk level (LOW, MEDIUM, HIGH, CRITICAL)
            - Detailed recommendation with implementation steps
            - Links to relevant AWS documentation
            
            Return a structured JSON response with findings and recommendations.
            """
        )
        
        query = f"""
        Please perform a comprehensive Well-Architected review for AWS account {aws_account_id} 
        in region {region}, focusing on pillars: {', '.join(pillars)}.
        
        1. First, analyze all AWS resources in the account
        2. Then evaluate them against the specified Well-Architected pillars
        3. Provide detailed findings and recommendations
        
        Return the results in a structured format suitable for saving to the database.
        """
        
        response = agent(query)
        
        findings, recommendations, score = parse_agent_response(response.message)
        
        save_review_results(review_id, findings, recommendations, score)
        
        logger.info(f"Completed Well-Architected review for {review_id}")
        
        return {
            'success': True,
            'reviewId': review_id,
            'findings': len(findings),
            'recommendations': len(recommendations),
            'score': score
        }
        
    except Exception as e:
        logger.error(f"Error performing Well-Architected review: {str(e)}")
        update_review_status(review_id, 'FAILED', str(e))
        return {
            'success': False,
            'error': str(e)
        }

class AWSResourceAnalyzer:
    """Analyze AWS resources for Well-Architected review"""
    
    def __init__(self, account_id, region):
        self.account_id = account_id
        self.region = region
        self.session = boto3.Session(region_name=region)
    
    def analyze_all_resources(self):
        """Analyze all relevant AWS resources"""
        results = {
            'account_id': self.account_id,
            'region': self.region,
            'timestamp': datetime.utcnow().isoformat(),
            'services': {}
        }
        
        try:
            results['services']['ec2'] = self.analyze_ec2()
            results['services']['s3'] = self.analyze_s3()
            results['services']['rds'] = self.analyze_rds()
            results['services']['lambda'] = self.analyze_lambda()
            results['services']['iam'] = self.analyze_iam()
            results['services']['cloudformation'] = self.analyze_cloudformation()
        except Exception as e:
            logger.error(f"Error analyzing resources: {str(e)}")
            results['error'] = str(e)
        
        return results
    
    def analyze_ec2(self):
        """Analyze EC2 instances"""
        try:
            ec2 = self.session.client('ec2')
            response = ec2.describe_instances()
            
            instances = []
            for reservation in response['Reservations']:
                for instance in reservation['Instances']:
                    instances.append({
                        'instance_id': instance['InstanceId'],
                        'instance_type': instance['InstanceType'],
                        'state': instance['State']['Name'],
                        'security_groups': [sg['GroupId'] for sg in instance['SecurityGroups']],
                        'subnet_id': instance.get('SubnetId'),
                        'vpc_id': instance.get('VpcId')
                    })
            
            return {'instances': instances, 'count': len(instances)}
        except Exception as e:
            logger.error(f"Error analyzing EC2: {str(e)}")
            return {'error': str(e)}
    
    def analyze_s3(self):
        """Analyze S3 buckets"""
        try:
            s3 = self.session.client('s3')
            response = s3.list_buckets()
            
            buckets = []
            for bucket in response['Buckets']:
                bucket_name = bucket['Name']
                bucket_info = {'name': bucket_name}
                
                try:
                    bucket_info['encryption'] = s3.get_bucket_encryption(Bucket=bucket_name)
                except:
                    bucket_info['encryption'] = None
                
                try:
                    bucket_info['versioning'] = s3.get_bucket_versioning(Bucket=bucket_name)
                except:
                    bucket_info['versioning'] = None
                
                buckets.append(bucket_info)
            
            return {'buckets': buckets, 'count': len(buckets)}
        except Exception as e:
            logger.error(f"Error analyzing S3: {str(e)}")
            return {'error': str(e)}
    
    def analyze_rds(self):
        """Analyze RDS instances"""
        try:
            rds = self.session.client('rds')
            response = rds.describe_db_instances()
            
            instances = []
            for instance in response['DBInstances']:
                instances.append({
                    'db_instance_identifier': instance['DBInstanceIdentifier'],
                    'db_instance_class': instance['DBInstanceClass'],
                    'engine': instance['Engine'],
                    'encrypted': instance.get('StorageEncrypted', False),
                    'multi_az': instance.get('MultiAZ', False),
                    'backup_retention_period': instance.get('BackupRetentionPeriod', 0)
                })
            
            return {'instances': instances, 'count': len(instances)}
        except Exception as e:
            logger.error(f"Error analyzing RDS: {str(e)}")
            return {'error': str(e)}
    
    def analyze_lambda(self):
        """Analyze Lambda functions"""
        try:
            lambda_client = self.session.client('lambda')
            response = lambda_client.list_functions()
            
            functions = []
            for function in response['Functions']:
                functions.append({
                    'function_name': function['FunctionName'],
                    'runtime': function['Runtime'],
                    'memory_size': function['MemorySize'],
                    'timeout': function['Timeout'],
                    'last_modified': function['LastModified']
                })
            
            return {'functions': functions, 'count': len(functions)}
        except Exception as e:
            logger.error(f"Error analyzing Lambda: {str(e)}")
            return {'error': str(e)}
    
    def analyze_iam(self):
        """Analyze IAM resources"""
        try:
            iam = self.session.client('iam')
            
            roles_response = iam.list_roles()
            policies_response = iam.list_policies(Scope='Local')
            
            return {
                'roles': {'count': len(roles_response['Roles'])},
                'policies': {'count': len(policies_response['Policies'])}
            }
        except Exception as e:
            logger.error(f"Error analyzing IAM: {str(e)}")
            return {'error': str(e)}
    
    def analyze_cloudformation(self):
        """Analyze CloudFormation stacks"""
        try:
            cf = self.session.client('cloudformation')
            response = cf.describe_stacks()
            
            stacks = []
            for stack in response['Stacks']:
                stacks.append({
                    'stack_name': stack['StackName'],
                    'stack_status': stack['StackStatus'],
                    'creation_time': stack['CreationTime'].isoformat(),
                    'drift_information': stack.get('DriftInformation', {})
                })
            
            return {'stacks': stacks, 'count': len(stacks)}
        except Exception as e:
            logger.error(f"Error analyzing CloudFormation: {str(e)}")
            return {'error': str(e)}

class WellArchitectedEvaluator:
    """Evaluate resources against Well-Architected Framework"""
    
    def evaluate(self, resources, pillars):
        """Evaluate resources against specified pillars"""
        findings = []
        recommendations = []
        
        if 'all' in pillars or 'security' in pillars:
            sec_findings, sec_recs = self.evaluate_security(resources)
            findings.extend(sec_findings)
            recommendations.extend(sec_recs)
        
        if 'all' in pillars or 'reliability' in pillars:
            rel_findings, rel_recs = self.evaluate_reliability(resources)
            findings.extend(rel_findings)
            recommendations.extend(rel_recs)
        
        if 'all' in pillars or 'performance' in pillars:
            perf_findings, perf_recs = self.evaluate_performance(resources)
            findings.extend(perf_findings)
            recommendations.extend(perf_recs)
        
        if 'all' in pillars or 'cost' in pillars:
            cost_findings, cost_recs = self.evaluate_cost_optimization(resources)
            findings.extend(cost_findings)
            recommendations.extend(cost_recs)
        
        return {
            'findings': findings,
            'recommendations': recommendations,
            'total_findings': len(findings),
            'total_recommendations': len(recommendations)
        }
    
    def evaluate_security(self, resources):
        """Evaluate security pillar"""
        findings = []
        recommendations = []
        
        s3_data = resources.get('services', {}).get('s3', {})
        if 'buckets' in s3_data:
            for bucket in s3_data['buckets']:
                if not bucket.get('encryption'):
                    findings.append({
                        'id': f"s3-encryption-{bucket['name']}",
                        'pillar': 'Security',
                        'title': 'S3 Bucket Not Encrypted',
                        'description': f"S3 bucket {bucket['name']} does not have encryption enabled",
                        'severity': 'HIGH',
                        'resourceArn': f"arn:aws:s3:::{bucket['name']}",
                        'service': 'S3'
                    })
                    
                    recommendations.append({
                        'id': f"s3-encryption-rec-{bucket['name']}",
                        'title': 'Enable S3 Bucket Encryption',
                        'description': f"Enable server-side encryption for S3 bucket {bucket['name']}",
                        'priority': 'HIGH',
                        'effort': 'Low',
                        'implementationGuide': 'Use AWS KMS or AES-256 encryption for S3 bucket'
                    })
        
        return findings, recommendations
    
    def evaluate_reliability(self, resources):
        """Evaluate reliability pillar"""
        findings = []
        recommendations = []
        
        rds_data = resources.get('services', {}).get('rds', {})
        if 'instances' in rds_data:
            for instance in rds_data['instances']:
                if not instance.get('multi_az'):
                    findings.append({
                        'id': f"rds-multiaz-{instance['db_instance_identifier']}",
                        'pillar': 'Reliability',
                        'title': 'RDS Instance Not Multi-AZ',
                        'description': f"RDS instance {instance['db_instance_identifier']} is not configured for Multi-AZ deployment",
                        'severity': 'MEDIUM',
                        'resourceArn': f"arn:aws:rds:{resources['region']}:{resources['account_id']}:db:{instance['db_instance_identifier']}",
                        'service': 'RDS'
                    })
        
        return findings, recommendations
    
    def evaluate_performance(self, resources):
        """Evaluate performance efficiency pillar"""
        findings = []
        recommendations = []
        
        return findings, recommendations
    
    def evaluate_cost_optimization(self, resources):
        """Evaluate cost optimization pillar"""
        findings = []
        recommendations = []
        
        return findings, recommendations

def parse_agent_response(response_text):
    """Parse agent response to extract findings, recommendations, and score"""
    try:
        if isinstance(response_text, str) and response_text.strip().startswith('{'):
            response_data = json.loads(response_text)
        else:
            response_data = {
                'findings': [],
                'recommendations': [],
                'score': 75.0,
                'raw_response': str(response_text)
            }
        
        findings = response_data.get('findings', [])
        recommendations = response_data.get('recommendations', [])
        score = response_data.get('score', 75.0)
        
        return findings, recommendations, score
        
    except Exception as e:
        logger.error(f"Error parsing agent response: {str(e)}")
        return [], [], 0.0

@tracer.capture_method
def save_review_results(review_id, findings, recommendations, score):
    """Save review results to DynamoDB"""
    try:
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
                UpdateExpression="SET #status = :status, #findings = :findings, #recommendations = :recommendations, #score = :score, #updatedAt = :updatedAt",
                ExpressionAttributeNames={
                    '#status': 'status',
                    '#findings': 'findings',
                    '#recommendations': 'recommendations',
                    '#score': 'score',
                    '#updatedAt': 'updatedAt'
                },
                ExpressionAttributeValues={
                    ':status': 'COMPLETED',
                    ':findings': findings,
                    ':recommendations': recommendations,
                    ':score': score,
                    ':updatedAt': datetime.utcnow().isoformat()
                }
            )
            
            logger.info(f"Saved review results for {review_id}")
        
    except Exception as e:
        logger.error(f"Error saving review results: {str(e)}")
        raise

@tracer.capture_method
def update_review_status(review_id, status, error_message=None):
    """Update review status"""
    try:
        response = table.query(
            KeyConditionExpression='reviewId = :reviewId',
            ExpressionAttributeValues={':reviewId': review_id},
            ScanIndexForward=False,
            Limit=1
        )
        
        if response['Items']:
            item = response['Items'][0]
            
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
            
            table.update_item(
                Key={
                    'reviewId': review_id,
                    'timestamp': item['timestamp']
                },
                UpdateExpression=update_expression,
                ExpressionAttributeNames=expression_attribute_names,
                ExpressionAttributeValues=expression_attribute_values
            )
            
    except Exception as e:
        logger.error(f"Error updating review status: {str(e)}")
        raise