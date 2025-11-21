# Troubleshooting Guide

## What to do if it fails

### Major missing → fix Intro parameter
**Symptoms:**
- Log shows: `{"tag":"Interview","major":"missing",...}`
- User receives: "I'd like to know what your major is..."
- State does not advance (no new questions added to asked_questions)

**Solution:**
- Verify the Intro page collects the "major" parameter with `@sys.any`
- Ensure the parameter is marked as required
- Check that the parameter name is exactly "major" (case-sensitive)
- Verify the transition to Interview page only occurs after major is filled

**Log lines to look for:**
```
{"tag":"Interview","page":"Interview","major":"missing","countsSummary":{...},"chosenSection":null,"chosenQuestionLength":0}
```

---

### Resolver not firing → verify Tag is exactly 'Interview' on the Interview page route
**Symptoms:**
- Log shows: `{"tag":"Interview",...}` but `chosenSection` is still "Interview"
- Or you see: `{"level":"error","message":"Unknown tag received: Interview",...}`

**Solution:**
1. In Dialogflow CX Console, go to the Interview page
2. Check the Route fulfillment settings
3. Verify the Fulfillment Tag is set to exactly `Interview` (case-sensitive, no quotes)
4. Ensure the route condition is correct
5. Verify `fulfillmentInfo.tag` is being sent in the webhook request

**Log lines to look for:**
```
{"tag":"Interview","chosenSection":"Interest and Motivation",...}  // ✓ Good - resolver worked
{"tag":"Interview","chosenSection":"Interview",...}  // ✗ Bad - resolver didn't fire
{"level":"error","message":"Unknown tag received: Interview",...}  // ✗ Bad - tag not recognized
```

---

### 403/404 → check webhook URL and auth
**Symptoms:**
- HTTP 403 Forbidden
- HTTP 404 Not Found
- Connection refused

**Solution:**
1. Verify the webhook URL in Dialogflow CX Console matches your Cloud Run service URL
2. Check Cloud Run service is deployed and running
3. Verify service has proper IAM permissions (Cloud Run Invoker role)
4. Check if authentication is required (Dialogflow CX may need service account)
5. Test health endpoint: `GET https://your-service-url/health` should return `{"status":"ok"}`

**Log lines to look for:**
- No logs appear (webhook not being called)
- Check Cloud Run logs in GCP Console

---

### Questions not rotating → check section completion logic
**Symptoms:**
- Same section repeats
- `completed_sections` not updating
- `next_page` always points to same section

**Solution:**
1. Verify `questionsPerSection` configuration matches expected counts
2. Check `section_question_count` is incrementing correctly
3. Verify `completed_sections` array is being updated when target count reached
4. Check that `next_page` logic selects from remaining sections

**Log lines to look for:**
```
{"tag":"Interview","countsSummary":{"sectionCounts":2,"completedSections":1,...},"chosenSection":"Academic Experience",...}
```
- Check `completedSections` count increases
- Check `chosenSection` changes between requests

---

### Empty question arrays → check major mapping
**Symptoms:**
- Error: "there was an error loading questions"
- Warning in logs about empty arrays
- Technical Questions fail for specific major

**Solution:**
1. Verify major value matches exactly: "Cybersecurity", "Computer Information Systems", "Computer Science", or "General"
2. Check `questionSets["Technical Questions"][major]` exists for the major
3. If major doesn't match, system falls back to "General"
4. Verify question arrays are not empty in code

**Log lines to look for:**
```
{"level":"error","message":"Technical Questions array empty for major, using General",...}
```

---

### asked_questions growing too large → check trimming
**Symptoms:**
- Response payloads are very large
- Performance degradation over time

**Solution:**
- System automatically trims `asked_questions` to last 100 entries
- This is handled automatically in code: `askedQuestions.slice(-MAX_ASKED_QUESTIONS)`
- No action needed, but verify trimming is working

**Log lines to look for:**
```
{"countsSummary":{"askedQuestions":100,...}}  // Should cap at 100
```

---

### All sections complete but not going to Closing
**Symptoms:**
- All 5 sections completed but `next_page` is not "Closing"
- Interview continues indefinitely

**Solution:**
1. Verify all 5 sections are in `completed_sections` array
2. Check resolver logic: when no remaining sections, should return "Closing"
3. Verify sections array matches exactly: ["Interest and Motivation", "Academic Experience", "Transferable Skills", "Behavioral Questions", "Technical Questions"]

**Log lines to look for:**
```
{"countsSummary":{"completedSections":5,...},"chosenSection":"Closing",...}  // ✓ Good
```

---

## Common Log Patterns

### Successful request:
```json
{"tag":"Interview","page":"Interview","major":"Computer Science","countsSummary":{"sectionCounts":1,"completedSections":0,"askedQuestions":1},"chosenSection":"Interest and Motivation","chosenQuestionLength":45}
```

### Missing major:
```json
{"tag":"Interview","page":"Interview","major":"missing","countsSummary":{...},"chosenSection":null,"chosenQuestionLength":0}
```

### Error:
```json
{"level":"error","message":"Error in dialogflowWebhook","stackExists":true}
```

### Dedup overflow (all questions asked, allowing repeats):
```json
{"dedupOverflow":true,"section":"Behavioral Questions"}
```

---

## Quick Diagnostic Commands

### Test health endpoint:
```bash
curl http://localhost:8080/health
# Should return: {"status":"ok"}
```

### Test with sample payload:
```bash
curl -X POST http://localhost:8080/ \
  -H "Content-Type: application/json" \
  -d '{
    "fulfillmentInfo": {"tag": "Interview"},
    "sessionInfo": {
      "parameters": {
        "major": "Computer Science"
      }
    }
  }'
```

### Run tests:
```bash
npm test
```

---

## Deployment Checklist

- [ ] Cloud Run service deployed with entry point `dialogflowWebhook`
- [ ] Webhook URL configured in Dialogflow CX Console
- [ ] IAM permissions set (Cloud Run Invoker)
- [ ] Intro page collects "major" parameter (@sys.any)
- [ ] Interview page route has Fulfillment Tag = "Interview"
- [ ] Transition from Intro to Interview only after major is filled
- [ ] Health endpoint accessible: `GET /health` returns 200

