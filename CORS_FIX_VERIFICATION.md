# CORS Fix Verification Guide

## Changes Made

### 1. Removed Route-Level OPTIONS Handler
- **Why**: Route-level handler was potentially short-circuiting CORS headers
- **Solution**: Rely on global `app.options("*", cors(corsOptions))` which ensures CORS headers are always set

### 2. Enhanced Logging
- Global logging middleware logs all OPTIONS requests
- Special logging for `/api/conversation-token` OPTIONS requests
- GET handler logs requestId and header presence

### 3. Middleware Order (Verified Correct)
```
1. app.use(cors(corsOptions))           // Global CORS middleware
2. app.options("*", cors(corsOptions))  // Explicit OPTIONS handler
3. Logging middleware                    // Logs but doesn't interfere
4. Routes                                // Route handlers
```

## Verification Commands

### Local Testing

1. **Start backend locally:**
   ```bash
   cd /home/runner/workspace/backend
   npm run dev
   # Or: node server/index.ts (depending on your setup)
   ```

2. **Test OPTIONS preflight (localhost):**
   ```bash
   curl -i -X OPTIONS "http://localhost:5000/api/conversation-token" \
     -H "Origin: http://localhost:3000" \
     -H "Access-Control-Request-Method: GET" \
     -H "Access-Control-Request-Headers: x-request-id"
   ```

3. **Expected Response Headers (localhost):**
   ```
   HTTP/1.1 204 No Content
   Access-Control-Allow-Origin: http://localhost:3000
   Access-Control-Allow-Methods: GET,POST,PUT,PATCH,DELETE,OPTIONS
   Access-Control-Allow-Headers: Content-Type,Authorization,X-Requested-With,x-api-secret,X-Request-Id,x-request-id
   Access-Control-Allow-Credentials: true
   Access-Control-Max-Age: 86400
   Vary: Origin
   ```

### Production Testing

1. **Test OPTIONS preflight (Railway):**
   ```bash
   curl -i -X OPTIONS "https://<your-railway-host>/api/conversation-token" \
     -H "Origin: https://<your-vercel-host>" \
     -H "Access-Control-Request-Method: GET" \
     -H "Access-Control-Request-Headers: x-request-id"
   ```

2. **Expected Response Headers (production):**
   ```
   HTTP/1.1 204 No Content
   Access-Control-Allow-Origin: https://<your-vercel-host>
   Access-Control-Allow-Methods: GET,POST,PUT,PATCH,DELETE,OPTIONS
   Access-Control-Allow-Headers: Content-Type,Authorization,X-Requested-With,x-api-secret,X-Request-Id,x-request-id
   Access-Control-Allow-Credentials: true
   Access-Control-Max-Age: 86400
   Vary: Origin
   ```

3. **Test GET request with x-request-id:**
   ```bash
   curl -i -X GET "https://<your-railway-host>/api/conversation-token" \
     -H "Origin: https://<your-vercel-host>" \
     -H "Authorization: Bearer <your-token>" \
     -H "X-Request-Id: test-request-123" \
     -H "Cookie: <your-cookie-if-needed>"
   ```

## Expected Backend Logs

### For OPTIONS Preflight:
```
[CONVERSATION-TOKEN] OPTIONS preflight - origin=https://<vercel-host> method=GET headers=x-request-id requestId=test-request-123
```

### For GET Request:
```
[CONVERSATION-TOKEN] GET request received { requestId: 'test-request-123', origin: 'https://<vercel-host>', hasRequestIdHeader: true, userId: '...', timestamp: '...' }
[CONVERSATION-TOKEN] Cache MISS - Processing new request (requestId=test-request-123, timestamp=...)
```

## Browser DevTools Verification Checklist

1. **Open DevTools → Network tab**
2. **Click "Start Interview" button once**
3. **Verify:**
   - ✅ OPTIONS preflight request appears first
   - ✅ Status: `204` or `200`
   - ✅ Response headers include:
     - `Access-Control-Allow-Origin: https://<your-vercel-host>` (specific, not `*`)
     - `Access-Control-Allow-Headers: ... x-request-id ...`
     - `Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS`
     - `Access-Control-Allow-Credentials: true`
   - ✅ GET `/api/conversation-token` request follows
   - ✅ Status: `200` (or appropriate error code)
   - ✅ Request headers include `x-request-id: <uuid>`
   - ✅ No CORS errors in console
   - ✅ Only ONE request per click (button disabled during request)

## Security Verification

- ✅ `credentials: true` enabled
- ✅ Origin is allowlisted (not `*`)
- ✅ CORS headers correctly set for credentialed requests
- ✅ No sensitive data in logs

## Troubleshooting

### If OPTIONS returns 404:
- Check that `app.options("*", cors(corsOptions))` is after `app.use(cors(corsOptions))`
- Verify middleware order is correct

### If headers are missing:
- Ensure CORS middleware runs before any route handlers
- Check that `allowedHeaders` includes `x-request-id`

### If origin is `*`:
- Verify `credentials: true` is set (forces specific origin)
- Check origin callback function is working correctly

