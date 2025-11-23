# How to Create a New OpenAI API Key with Realtime API Access

## Step-by-Step Guide

### Step 1: Go to OpenAI API Keys Page

1. Visit: https://platform.openai.com/account/api-keys
2. Sign in to your OpenAI account
3. If you don't have an account, create one at https://platform.openai.com/

### Step 2: Check Your Account Status

Before creating a key, verify your account:

1. **Check Billing**:
   - Go to https://platform.openai.com/account/billing
   - Ensure you have credits/quota available
   - Realtime API requires an active billing account

2. **Check Organization Settings** (if applicable):
   - Go to https://platform.openai.com/account/org-settings
   - Check if there are any API restrictions
   - Ensure "Realtime API" is not blocked

### Step 3: Create a New API Key

1. On the API Keys page, click **"Create new secret key"**
2. Give it a name (e.g., "Railway Production - Realtime API")
3. **Important**: Do NOT restrict the key initially
   - Leave "Restrict to specific projects" unchecked
   - Leave "Restrict to specific IPs" unchecked
   - We'll add restrictions later if needed
4. Click **"Create secret key"**
5. **IMMEDIATELY copy the key** - you won't see it again!
   - It should start with `sk-proj-` or `sk-`
   - Copy the ENTIRE key (it's long!)

### Step 4: Verify Key Format

The key should:
- ✅ Start with `sk-proj-` (project key) or `sk-` (standard key)
- ✅ Be very long (50+ characters)
- ✅ Have no spaces or extra characters
- ✅ Be copied completely

### Step 5: Check Realtime API Access

**Important**: Realtime API access is determined by:

1. **Account Type**: 
   - You need a paid OpenAI account
   - Free tier doesn't have Realtime API access

2. **Billing Status**:
   - Go to https://platform.openai.com/account/billing
   - Ensure billing is set up and active
   - Check if you have available credits

3. **API Access**:
   - Realtime API is available to all paid accounts
   - No special permission needed beyond having a paid account
   - If you can create API keys, you should have access

### Step 6: Test the Key (Optional)

You can test if the key works before adding it to Railway:

```bash
# Test with curl (replace YOUR_KEY with your actual key)
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer YOUR_KEY"
```

If it works, you'll get a JSON response with models.
If invalid, you'll get an error.

### Step 7: Update Railway

1. Go to Railway Dashboard
2. Click on your backend service
3. Go to **"Variables"** tab
4. Find `OPENAI_API_KEY`
5. Click **"Edit"** (or delete and recreate)
6. **Paste the NEW key**:
   - Make sure there are NO extra spaces
   - Make sure you copied the ENTIRE key
   - Double-check it starts with `sk-`
7. Click **"Save"**
8. Railway will automatically redeploy

### Step 8: Verify in Logs

After Railway redeploys, check the logs. You should see:

```
🔑 Using API key: sk-proj...XXXX
✓ Connected to OpenAI Realtime API
✓ Session configuration sent to OpenAI
✓ OpenAI session updated and ready
```

Instead of:
```
❌ Error code: invalid_api_key
```

## Common Issues & Solutions

### Issue 1: "Invalid API key" Error

**Possible Causes**:
- Typo when copying
- Extra spaces
- Incomplete key copied
- Wrong key from different account

**Solution**:
- Create a completely new key
- Copy it carefully
- Paste it into Railway without modifications

### Issue 2: "Insufficient Quota" Error

**Cause**: Account has no credits

**Solution**:
1. Go to https://platform.openai.com/account/billing
2. Add payment method
3. Add credits

### Issue 3: "Permission Denied" Error

**Cause**: Organization restrictions or key restrictions

**Solution**:
1. Check organization settings: https://platform.openai.com/account/org-settings
2. Ensure Realtime API is not blocked
3. Create a key without restrictions initially

### Issue 4: Key Works for Other APIs but Not Realtime

**Cause**: Account might not have Realtime API access

**Solution**:
1. Verify billing is set up: https://platform.openai.com/account/billing
2. Check if Realtime API is available in your region
3. Contact OpenAI support if needed

## How to Know if Key Has Right Permissions

### ✅ Signs of Correct Permissions:

1. **Key Format**: Starts with `sk-proj-` or `sk-`
2. **Account Status**: Paid account with billing set up
3. **No Restrictions**: Key created without restrictions
4. **Test Success**: Can connect to OpenAI API

### ❌ Signs of Permission Issues:

1. **Invalid API Key Error**: Key format or value is wrong
2. **Insufficient Quota**: Account has no credits
3. **Permission Denied**: Organization restrictions
4. **Rate Limit**: Too many requests (different issue)

## Realtime API Specific Requirements

The Realtime API requires:

1. ✅ **Paid OpenAI Account** (not free tier)
2. ✅ **Active Billing** (payment method added)
3. ✅ **Available Credits** (account has balance)
4. ✅ **Valid API Key** (created from your account)
5. ✅ **No Organization Restrictions** (if using org account)

## Security Best Practices

After creating the key:

1. ✅ **Never commit to Git** - Already using Railway Variables ✅
2. ✅ **Use separate keys** - Different keys for dev/prod
3. ✅ **Rotate regularly** - Create new keys every few months
4. ✅ **Set usage limits** - In OpenAI dashboard
5. ✅ **Monitor usage** - Check https://platform.openai.com/usage

## Next Steps

1. ✅ Create new API key following steps above
2. ✅ Update Railway with new key
3. ✅ Wait for Railway to redeploy
4. ✅ Test interview flow
5. ✅ Check logs for success

If you still get errors after creating a new key, the issue might be:
- Account billing not set up
- Account restrictions
- Regional restrictions

In that case, contact OpenAI support or check your account status.

