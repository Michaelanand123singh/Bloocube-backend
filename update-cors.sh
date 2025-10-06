#!/bin/bash

# Script to update CORS configuration on Cloud Run
# This should be run from GCP Cloud Shell or with proper gcloud authentication

echo "Updating CORS configuration on Cloud Run..."

# Update the Cloud Run service with new CORS environment variables
gcloud run services update bloocube-backend \
  --region=asia-southeast1 \
  --update-env-vars="CORS_ORIGIN=http://localhost:3000,https://bloocube.com,https://admin.bloocube.com,https://api-backend.bloocube.com,https://api-ai-services.bloocube.com" \
  --update-env-vars="FRONTEND_URL=https://bloocube.com"

echo "CORS configuration updated successfully!"
echo "Testing CORS endpoint..."
curl -s https://api-backend.bloocube.com/cors-test | jq .
