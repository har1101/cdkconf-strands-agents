#!/bin/bash

echo "Getting API URLs from CloudFormation stack..."

API_GATEWAY_URL=$(aws cloudformation describe-stacks --stack-name StrandsAgentsWellArchitectedStack --query 'Stacks[0].Outputs[?OutputKey==`ApiGatewayURL`].OutputValue' --output text)
APPSYNC_URL=$(aws cloudformation describe-stacks --stack-name StrandsAgentsWellArchitectedStack --query 'Stacks[0].Outputs[?OutputKey==`AppSyncURL`].OutputValue' --output text)

echo "API Gateway URL: $API_GATEWAY_URL"
echo "AppSync URL: $APPSYNC_URL"

# Update .env file
cat > frontend/.env << EOF
# AWS API URLs - Generated automatically
VITE_API_GATEWAY_URL=$API_GATEWAY_URL
VITE_APPSYNC_URL=$APPSYNC_URL
VITE_APPSYNC_API_KEY=
EOF

echo "Updated frontend/.env with actual URLs"
echo "Note: VITE_APPSYNC_API_KEY needs to be set manually (AppSync uses IAM auth in this setup)"