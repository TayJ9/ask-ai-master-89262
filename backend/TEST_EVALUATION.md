# Testing the Adaptive AI Evaluation System

## Quick Start

1. **Set your OpenAI API key:**
   ```bash
   # Windows PowerShell
   $env:OPENAI_API_KEY="your-api-key-here"
   
   # Linux/Mac
   export OPENAI_API_KEY="your-api-key-here"
   ```

2. **Run the test:**
   ```bash
   cd backend
   npx tsx test-adaptive-evaluator.ts
   ```

## What the Test Covers

### ✅ Test Case 1: Mixed Question Types
Tests 4 different question types:
- **Informational**: "Can you tell me about yourself?"
- **Behavioral**: "Tell me about a time when..."
- **Technical**: "What is object-oriented programming?"
- **Situational**: "What would you do if..."

### ✅ Features Tested

1. **Question Type Detection**
   - Verifies that different question types are correctly identified
   - Checks that appropriate rubric is applied

2. **Conditional STAR Structure**
   - Behavioral questions should evaluate STAR (0-20 points)
   - Technical/Situational/Informational should NOT evaluate STAR (0 points)
   - Checks feedback for STAR mentions

3. **Resume Context Integration**
   - Tests with sample resume text
   - Verifies resume alignment is considered
   - Checks for mentions of resume experience/skills

4. **Role/Major Context**
   - Tests with role: "Software Engineer Intern"
   - Tests with major: "Computer Science"
   - Verifies context influences evaluation

5. **Coachability Emphasis**
   - Checks for emphasis on learning/growth for entry-level candidates
   - Verifies coachability is weighted appropriately

6. **Schema Validation**
   - Validates all required fields are present
   - Checks data types and ranges
   - Ensures structure matches expected format

## Expected Output

The test will output:
- ✅ Question type classifications
- ✅ Scores for each question
- ✅ Strengths and improvements
- ✅ Resume alignment checks
- ✅ Coachability emphasis checks
- ✅ Schema validation results
- ✅ Full evaluation JSON

## Sample Resume

A sample resume is included in `sample-resume.txt` for testing resume context integration.

## Troubleshooting

**Error: OPENAI_API_KEY not set**
- Make sure you've set the environment variable before running the test
- Check that your API key is valid

**Error: Module not found**
- Run `npm install` in the backend directory
- Make sure you're in the `backend` directory when running the test

**Error: Timeout**
- The OpenAI API call has a 60-second timeout
- If it times out, check your internet connection and API key

## Next Steps

After running the test, you should verify:
1. ✅ Behavioral questions mention STAR in feedback
2. ✅ Technical questions don't mention STAR
3. ✅ Resume context is used when provided
4. ✅ Coachability is emphasized for entry-level
5. ✅ All schema validations pass
