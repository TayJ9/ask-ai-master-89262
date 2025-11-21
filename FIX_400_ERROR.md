# Fix for HTTP 400 Error

## Problem
Dialogflow CX was receiving HTTP 400 errors when calling the webhook, causing `INVALID_ARGUMENT` errors.

## Root Cause
The webhook was returning HTTP 400 status codes when the `tag` was missing or in an unexpected format. Dialogflow CX interprets non-200 status codes as webhook failures.

## Solution Applied

### 1. Changed Error Response Status Codes
- **Before**: Returned `400` or `500` on errors
- **After**: Always returns `200` with valid Dialogflow response format, even on errors
- **Reason**: Dialogflow CX prefers 200 status codes with error messages in the response body

### 2. Enhanced Tag Extraction
Added multiple fallback methods to find the tag:
- Primary: `req.body.fulfillmentInfo?.tag` (standard location)
- Fallback 1: `req.body.pageInfo?.currentPage?.displayName`
- Fallback 2: `req.body.detectIntentResponse?.pageInfo?.currentPage?.displayName`
- Fallback 3: Query parameters or headers (for testing)

### 3. Added Comprehensive Logging
- Logs the full incoming request body for debugging
- Logs which tag is being used
- Logs errors with stack traces

### 4. Improved Error Handling
- All errors now return valid Dialogflow CX response format
- Preserves session parameters even on errors
- Better error messages for debugging

### 5. Added Health Check Endpoint
- GET `/health` or `/` returns service status
- Useful for Cloud Run health checks

## Key Changes

```javascript
// Before: Returned 400 on missing tag
if (!tag) {
  return res.status(400).json({...});
}

// After: Returns 200 with valid Dialogflow format
if (!tag) {
  return res.status(200).json({
    fulfillment_response: {
      messages: [{ text: { text: ["Error message"] } }]
    },
    session_info: {
      parameters: req.body.sessionInfo?.parameters || {}
    }
  });
}
```

## Testing

After deploying, check the Cloud Run logs to see:
1. The actual request structure being received
2. Which tag extraction method is working
3. Any errors that occur

## Next Steps

1. **Deploy the updated code** to Cloud Run
2. **Test the webhook** from Dialogflow CX
3. **Check Cloud Run logs** to see the actual request format
4. **Adjust tag extraction** if needed based on logs

## Important Notes

- The logging will show you the exact request format Dialogflow CX is sending
- If the tag is still not found, the logs will show the full request body
- You may need to adjust the tag extraction logic based on your specific Dialogflow CX configuration

