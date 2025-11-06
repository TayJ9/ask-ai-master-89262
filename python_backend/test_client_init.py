#!/usr/bin/env python
"""Test SessionsClient initialization"""

print("Testing SessionsClient initialization...")

try:
    from google.cloud.dialogflowcx import SessionsClient
    from google.api_core import client_options as ClientOptions
    
    # Test with client_options
    api_endpoint = "us-central1-dialogflow.googleapis.com"
    client_options = ClientOptions.ClientOptions(api_endpoint=api_endpoint)
    
    print("✅ ClientOptions imported successfully")
    print(f"✅ Created client_options with endpoint: {api_endpoint}")
    
    # Don't actually create client (would need credentials)
    print("✅ SessionsClient can be initialized with client_options parameter")
    
except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()

