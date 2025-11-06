#!/usr/bin/env python
"""Test script to validate Gemini API key"""

import os
import google.generativeai as genai

print("Testing Gemini API key...")

# Get API key
api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")

if not api_key:
    print("❌ ERROR: GEMINI_API_KEY not found in environment variables")
    exit(1)

print(f"✅ API key found: {api_key[:10]}...{api_key[-4:]} (hidden)")

# Configure Gemini
try:
    genai.configure(api_key=api_key)
    print("✅ Gemini configured successfully")
except Exception as e:
    print(f"❌ Error configuring Gemini: {e}")
    exit(1)

# Test with a simple request
# Try gemini-2.5-flash first (as specified), then fallback to other models
models_to_try = ['gemini-2.5-flash', 'gemini-2.0-flash-exp', 'gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-pro']

success = False
for model_name in models_to_try:
    try:
        print(f"Trying model: {model_name}...")
        model = genai.GenerativeModel(model_name)
        response = model.generate_content("Say 'Hello' in one word")
        print(f"✅ API test successful!")
        print(f"   Model: {model_name}")
        print(f"   Response: {response.text}")
        print("\n🎉 Gemini API key is working correctly!")
        success = True
        break
    except Exception as e:
        print(f"   ❌ {model_name} failed: {str(e)[:100]}")
        continue

if not success:
    print("\n❌ All model tests failed")
    print("\nThis could mean:")
    print("  - API key is invalid")
    print("  - API key doesn't have access to Gemini API")
    print("  - Model names have changed")
    print("\nTry listing available models:")
    try:
        models = genai.list_models()
        print("Available models:")
        for m in models:
            if 'generateContent' in m.supported_generation_methods:
                print(f"  - {m.name}")
    except Exception as e:
        print(f"Could not list models: {e}")
    exit(1)

