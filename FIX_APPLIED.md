# ✅ Fix Applied: TextInput language_code Error

## Problem
Error: `Unknown field for TextInput: language_code`

## Root Cause
The `language_code` parameter was incorrectly placed on the `TextInput` object, but it should be on the `QueryInput` object.

## Fix Applied
Moved `language_code` from `TextInput` to `QueryInput`:

**Before:**
```python
query_input = QueryInput(
    text=TextInput(
        text="Hello, I'm ready to start the interview.",
        language_code=get_dialogflow_config()["language_code"]  # ❌ Wrong
    )
)
```

**After:**
```python
query_input = QueryInput(
    text=TextInput(
        text="Hello, I'm ready to start the interview."
    ),
    language_code=get_dialogflow_config()["language_code"]  # ✅ Correct
)
```

## Next Steps
1. **Restart the Python backend** (if running locally)
2. **Try the voice interview again**
3. The error should be resolved!

If the deployment is running, the fix will be picked up on the next deployment restart.

