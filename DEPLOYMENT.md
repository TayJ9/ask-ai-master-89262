# Dialogflow CX Webhook Deployment Guide

## Overview
This webhook handles dynamic interview questions for Dialogflow CX, running on Google Cloud Run Functions.

## Key Features
- ✅ Compatible with Google Cloud Functions Framework
- ✅ Handles all interview sections with proper randomization
- ✅ Tracks asked questions to avoid repetition
- ✅ Special handling for Technical Questions by major
- ✅ Natural transitions between questions and sections
- ✅ Proper session parameter management

## Local Testing

1. Install dependencies:
```bash
npm install
```

2. Run locally:
```bash
npm start
```

The function will be available at `http://localhost:8080`

3. Test with a sample Dialogflow request:
```bash
curl -X POST http://localhost:8080 \
  -H "Content-Type: application/json" \
  -d '{
    "fulfillmentInfo": {
      "tag": "Interest and Motivation"
    },
    "sessionInfo": {
      "parameters": {
        "major": "Computer Science",
        "section_question_count": {},
        "completed_sections": [],
        "asked_questions": []
      }
    }
  }'
```

## Deployment to Google Cloud Run

### Option 1: Using gcloud CLI

1. Build and deploy:
```bash
gcloud run deploy dialogflow-webhook \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --entry-point dialogflowWebhook \
  --memory 256Mi \
  --timeout 60s
```

2. Note the service URL from the output.

### Option 2: Using Cloud Build

1. Create a `cloudbuild.yaml`:
```yaml
steps:
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', 'gcr.io/$PROJECT_ID/dialogflow-webhook', '.']
  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', 'gcr.io/$PROJECT_ID/dialogflow-webhook']
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    entrypoint: gcloud
    args:
      - 'run'
      - 'deploy'
      - 'dialogflow-webhook'
      - '--image'
      - 'gcr.io/$PROJECT_ID/dialogflow-webhook'
      - '--platform'
      - 'managed'
      - '--region'
      - 'us-central1'
      - '--allow-unauthenticated'
      - '--entry-point'
      - 'dialogflowWebhook'
```

2. Deploy:
```bash
gcloud builds submit --config cloudbuild.yaml
```

### Option 3: Using Cloud Functions (2nd gen)

```bash
gcloud functions deploy dialogflowWebhook \
  --gen2 \
  --runtime nodejs18 \
  --region us-central1 \
  --entry-point dialogflowWebhook \
  --trigger-http \
  --allow-unauthenticated \
  --source .
```

## Configuration in Dialogflow CX

1. In your Dialogflow CX agent, go to **Fulfillment**.
2. Create a new webhook or edit existing one.
3. Set the webhook URL to your Cloud Run service URL.
4. In your flow pages, set the fulfillment tag to one of:
   - `Interest and Motivation`
   - `Academic Experience`
   - `Transferable Skills`
   - `Behavioral Questions`
   - `Technical Questions`
   - `Closing`

## Session Parameters

The webhook expects and returns these session parameters:

- `major`: The student's major (defaults to "General")
- `section_question_count`: Object tracking questions asked per section
- `completed_sections`: Array of completed section names
- `asked_questions`: Array of all questions asked (max 50 tracked)
- `next_page`: The next page/route to navigate to

## Response Format

The webhook returns a Dialogflow CX response with:
- `fulfillment_response.messages`: The question text
- `session_info.parameters`: Updated session parameters

## Troubleshooting

1. **Function not found**: Ensure the entry point name matches exactly (`dialogflowWebhook`)
2. **JSON parsing errors**: The Express middleware handles this automatically
3. **Timeout errors**: Increase the timeout in Cloud Run settings
4. **Memory issues**: Increase memory allocation if needed

## Entry Point

The entry point is `dialogflowWebhook` - make sure this matches in your deployment command.

