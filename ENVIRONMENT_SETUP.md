# Environment Variables Setup

To use Dialogflow CX integration, you need to set up the following environment variables in Replit Secrets:

## Required Environment Variables

1. **GOOGLE_CREDENTIALS** (Required)
   - This is the full JSON content of your Google Cloud service account key
   - To get this:
     1. Go to Google Cloud Console → IAM & Admin → Service Accounts
     2. Create or select a service account for Dialogflow
     3. Grant it the "Dialogflow API User" role
     4. Create a new JSON key and download it
     5. Copy the entire JSON content and paste it as the value for `GOOGLE_CREDENTIALS` in Replit Secrets

2. **DIALOGFLOW_PROJECT_ID** (Required)
   - Your Google Cloud Project ID (e.g., "my-project-12345")
   - Found in Google Cloud Console → Project Settings

3. **DIALOGFLOW_AGENT_ID** (Required)
   - Your Dialogflow CX Agent ID
   - Found in Dialogflow CX Console → Agent Settings
   - Usually looks like a UUID

4. **DIALOGFLOW_LOCATION_ID** (Optional, defaults to "us-central1")
   - The region where your Dialogflow agent is located
   - Common values: "us-central1", "us-east1", "europe-west1", etc.

5. **DIALOGFLOW_LANGUAGE_CODE** (Optional, defaults to "en")
   - Language code for the Dialogflow agent
   - Examples: "en", "es", "fr", etc.

6. **OPENAI_API_KEY** (Required for scoring)
   - Your OpenAI API key for end-of-interview analysis
   - Get from https://platform.openai.com/api-keys

## Setting Up in Replit

1. Click on the "Secrets" tab (lock icon) in Replit
2. Click "New Secret"
3. Add each environment variable above as a separate secret
4. For `GOOGLE_CREDENTIALS`, paste the entire JSON content (it will be a long string)

## Testing

After setting up, restart your Replit server and test the interview flow. If you see authentication errors, double-check:
- The JSON key is valid and not corrupted
- The service account has the correct permissions
- The Project ID, Agent ID, and Location ID are correct


