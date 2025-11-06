#!/usr/bin/env python
"""Test script to find correct import paths for google-cloud-dialogflow-cx"""

print("Testing import paths...")

# Try different import paths
imports_to_try = [
    "from google.cloud.dialogflow_cx_v3.services.sessions import SessionsClient",
    "from google.cloud.dialogflowcx import SessionsClient",
    "from google.cloud.dialogflow_cx import SessionsClient",
    "import google.cloud.dialogflow_cx_v3",
    "import google.cloud.dialogflow_cx",
]

for import_str in imports_to_try:
    try:
        exec(import_str)
        print(f"✅ SUCCESS: {import_str}")
    except ImportError as e:
        print(f"❌ FAILED: {import_str}")
        print(f"   Error: {e}")

# Try to list what's in google.cloud
try:
    import google.cloud
    print("\nAvailable modules in google.cloud:")
    print([x for x in dir(google.cloud) if not x.startswith('_')])
except Exception as e:
    print(f"Error listing google.cloud: {e}")

