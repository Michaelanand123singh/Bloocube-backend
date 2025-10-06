#!/bin/bash

# Deploy backend with CORS fix
echo "🚀 Deploying backend with CORS fix..."

# Set variables
PROJECT_ID="your-project-id"  # Replace with your actual project ID
REGION="asia-southeast1"
SERVICE_NAME="bloocube-backend"
IMAGE_NAME="asia-southeast1-docker.pkg.dev/$PROJECT_ID/bloocube/$SERVICE_NAME"

# Build and push the image
echo "📦 Building Docker image..."
docker build -t $IMAGE_NAME:latest .

echo "📤 Pushing image to Artifact Registry..."
docker push $IMAGE_NAME:latest

# Deploy to Cloud Run
echo "🚀 Deploying to Cloud Run..."
gcloud run deploy $SERVICE_NAME \
  --image $IMAGE_NAME:latest \
  --region $REGION \
  --platform managed \
  --allow-unauthenticated \
  --port 5000 \
  --memory 1Gi \
  --cpu 1 \
  --timeout 300 \
  --set-env-vars "NODE_ENV=production,CORS_ORIGIN=http://localhost:3000,https://bloocube.com,https://admin.bloocube.com,https://api-backend.bloocube.com,https://api-ai-services.bloocube.com"

echo "✅ Deployment complete!"
echo "🔍 Test CORS with: curl https://api-backend.bloocube.com/cors-test"
