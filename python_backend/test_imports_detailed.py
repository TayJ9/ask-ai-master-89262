#!/usr/bin/env python
"""Test detailed imports to find correct paths"""

print("Testing detailed import paths...")

# Test SessionsClient
try:
    from google.cloud.dialogflowcx import SessionsClient
    print("✅ SessionsClient: from google.cloud.dialogflowcx")
except Exception as e:
    print(f"❌ SessionsClient failed: {e}")

# Test types
types_to_test = [
    "DetectIntentRequest",
    "QueryInput",
    "QueryParameters",
    "OutputAudioConfig",
    "OutputAudioEncoding",
    "InputAudioConfig",
    "AudioEncoding"
]

print("\nTesting types imports...")
for type_name in types_to_test:
    try:
        exec(f"from google.cloud.dialogflowcx_v3 import {type_name}")
        print(f"✅ {type_name}: from google.cloud.dialogflowcx_v3")
    except Exception as e:
        try:
            exec(f"from google.cloud.dialogflowcx import {type_name}")
            print(f"✅ {type_name}: from google.cloud.dialogflowcx")
        except Exception as e2:
            print(f"❌ {type_name} failed: {e2}")

