# OpenAI API Key Troubleshooting Guide

## Current Error

```
❌ Error code: invalid_api_key
❌ Error message: "Incorrect API key provided: sk-proj-..."
```

## Common Causes & Solutions

### 1. ❌ Incorrect API Key

**Symptoms**: `invalid_api_key` error

**Possible Causes**:
- Typo when copying the key
- Extra spaces or characters
- Wrong key copied

**Solution**:
1. Go to https://platform.openai.com/account/api-keys
2. Find your API key (or create a new one)
3. **Carefully copy the entire key** (starts with `sk-`)
4. In Railway:
   - Go to your backend service → Variables tab
   - Edit `OPENAI_API_KEY`
   - Paste the key (make sure no extra spaces)
   - Save
5. Railway will auto-redeploy

### 2. ❌ API Key Doesn't Have Realtime API Access

**Symptoms**: `invalid_api_key` or `permission_denied` error

**Possible Causes**:
- Using an organization API key with restrictions
- API key doesn't have access to Realtime API
- Using a restricted key

**Solution**:
1. Check your OpenAI account permissions:
   - Go to https://platform.openai.com/account/org-settings
   - Check if your organization has restrictions
2. Create a new API key:
   - Go to https://platform.openai.com/account/api-keys
   - Click "Create new secret key"
   - Make sure it's not restricted
3. Update Railway with the new key

### 3. ❌ API Key Expired or Revoked

**Symptoms**: `invalid_api_key` error

**Possible Causes**:
- Key was revoked in OpenAI dashboard
- Key expired
- Key was deleted

**Solution**:
1. Check if the key still exists:
   - Go to https://platform.openai.com/account/api-keys
   - Look for your key
   - If it's not there, it was deleted
2. Create a new key:
   - Click "Create new secret key"
   - Copy the new key
   - Update Railway Variables

### 4. ❌ Wrong API Key Type

**Symptoms**: `invalid_api_key` error

**Possible Causes**:
- Using a key from a different OpenAI account
- Using a test/demo key
- Using an old key format

**Solution**:
1. Ensure you're using a valid API key from your OpenAI account
2. Keys should start with `sk-` (standard) or `sk-proj-` (project keys)
3. Both formats should work, but verify the key is active

## Step-by-Step Fix

### Step 1: Verify Your OpenAI Account

1. Go to https://platform.openai.com/
2. Sign in to your account
3. Check your account status:
   - Go to https://platform.openai.com/account/billing
   - Ensure you have credits/quota available
   - Check if there are any restrictions

### Step 2: Get a Fresh API Key

1. Go to https://platform.openai.com/account/api-keys
2. If you see your current key:
   - Click the "..." menu
   - Click "View key" to see it (if you remember it)
   - Or create a new one
3. Click "Create new secret key"
4. Give it a name (e.g., "Railway Production")
5. **Copy the key immediately** (you won't see it again!)
   - It should look like: `sk-proj-...` or `sk-...`

### Step 3: Update Railway

1. Go to your Railway project dashboard
2. Click on your backend service
3. Go to the "Variables" tab
4. Find `OPENAI_API_KEY`
5. Click "Edit" (or delete and recreate)
6. **Paste the new key**:
   - Make sure there are NO extra spaces
   - Make sure you copied the ENTIRE key
   - It should start with `sk-`
7. Click "Save" or "Add"
8. Railway will automatically redeploy

### Step 4: Verify the Fix

After Railway redeploys, check the logs. You should see:

```
✅ OPENAI_API_KEY: ✅ Set
🔑 OpenAI API key found, creating connection...
🔌 Connecting to OpenAI Realtime API...
✓ Connected to OpenAI Realtime API
```

Instead of:
```
❌ Error code: invalid_api_key
```

## Testing Your API Key

You can test your API key directly using curl:

```bash
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer YOUR_API_KEY_HERE"
```

If the key is valid, you'll get a JSON response with models.
If invalid, you'll get an error.

## Security Best Practices

1. ✅ **Never commit API keys to Git**
   - Keys are in Railway Variables (encrypted)
   - Never push `.env` files with keys

2. ✅ **Use separate keys for different environments**
   - Development key for local testing
   - Production key for Railway

3. ✅ **Rotate keys periodically**
   - Create new keys every few months
   - Revoke old keys

4. ✅ **Set usage limits**
   - Go to https://platform.openai.com/account/limits
   - Set spending limits to prevent unexpected charges

5. ✅ **Monitor usage**
   - Check https://platform.openai.com/usage
   - Monitor costs regularly

## Still Having Issues?

If you've tried all the above and still get `invalid_api_key`:

1. **Double-check the key**:
   - Copy it again from OpenAI dashboard
   - Make sure it's the full key
   - Check for typos

2. **Try a new key**:
   - Create a completely new API key
   - Update Railway with the new key

3. **Check OpenAI status**:
   - Go to https://status.openai.com/
   - Check if there are any API issues

4. **Verify account status**:
   - Ensure your OpenAI account is active
   - Check if you have any account restrictions
   - Verify billing is set up correctly

5. **Check Railway logs**:
   - Look for the masked API key in logs
   - Verify it starts with `sk-`
   - Check if the key format looks correct

## Expected Behavior After Fix

Once the API key is correct, you should see in Railway logs:

```
🔑 OpenAI API key found, creating connection...
🔌 Connecting to OpenAI Realtime API...
✓ Connected to OpenAI Realtime API
✓ Session configuration sent to OpenAI
✓ OpenAI session updated and ready
🎤 Triggering AI to start speaking...
✅ interview_started message sent
```

The interview should start successfully! 🎉

