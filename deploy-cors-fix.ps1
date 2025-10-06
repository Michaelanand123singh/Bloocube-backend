# Deploy backend with CORS fix
Write-Host "🚀 Deploying backend with CORS fix..." -ForegroundColor Green

# Set variables
$PROJECT_ID = "your-project-id"  # Replace with your actual project ID
$REGION = "asia-southeast1"
$SERVICE_NAME = "bloocube-backend"
$IMAGE_NAME = "asia-southeast1-docker.pkg.dev/$PROJECT_ID/bloocube/$SERVICE_NAME"

# Build and push the image
Write-Host "📦 Building Docker image..." -ForegroundColor Yellow
docker build -t $IMAGE_NAME:latest .

Write-Host "📤 Pushing image to Artifact Registry..." -ForegroundColor Yellow
docker push $IMAGE_NAME:latest

# Deploy to Cloud Run
Write-Host "🚀 Deploying to Cloud Run..." -ForegroundColor Yellow
gcloud run deploy $SERVICE_NAME `
  --image $IMAGE_NAME:latest `
  --region $REGION `
  --platform managed `
  --allow-unauthenticated `
  --port 5000 `
  --memory 1Gi `
  --cpu 1 `
  --timeout 300 `
  --set-env-vars "NODE_ENV=production,CORS_ORIGIN=http://localhost:3000,https://bloocube.com,https://admin.bloocube.com,https://api-backend.bloocube.com,https://api-ai-services.bloocube.com"

Write-Host "✅ Deployment complete!" -ForegroundColor Green
Write-Host "🔍 Test CORS with: Invoke-WebRequest https://api-backend.bloocube.com/cors-test" -ForegroundColor Cyan
