# Railway Database Connection Troubleshooting

## Error: ECONNREFUSED / WebSocket Connection Failed

If you see errors like:
```
Database connection check failed: ErrorEvent {
  code: 'ECONNREFUSED',
  _url: 'wss://postgres.railway.internal/v2'
}
```

This means the database connection is failing. Here's how to fix it:

## Solution 1: Check DATABASE_URL Format

The `DATABASE_URL` in Railway Variables should be a **PostgreSQL connection string**, not an internal Railway URL.

### Correct Format:
```
postgresql://user:password@host:port/database?sslmode=require
```

### For Neon Database:
```
postgresql://user:password@ep-xxx-xxx.us-east-2.aws.neon.tech/database?sslmode=require
```

### For Railway PostgreSQL:
If using Railway's PostgreSQL service:
1. Go to Railway Dashboard → Your PostgreSQL Service
2. Click "Variables" tab
3. Copy the `DATABASE_URL` value
4. Make sure it's in the format: `postgresql://postgres:password@hostname:5432/railway`

## Solution 2: Verify Database Service is Running

1. Go to Railway Dashboard
2. Check if your PostgreSQL/Neon database service is running
3. If it's stopped, start it

## Solution 3: Check Railway Service Linking

If using Railway's PostgreSQL:
1. Make sure your backend service is **linked** to the PostgreSQL service
2. Railway Dashboard → Your Backend Service → Settings → Variables
3. Verify `DATABASE_URL` is automatically set (should show as "from PostgreSQL service")

## Solution 4: Use Neon Database (Recommended)

If Railway's internal database isn't working:
1. Create a Neon account at https://neon.tech
2. Create a new database
3. Copy the connection string
4. Add it to Railway Variables as `DATABASE_URL`

## Solution 5: Test Connection Locally

To test if your DATABASE_URL works:
```bash
cd backend
DATABASE_URL="your-connection-string" npm run setup-db
```

If this works locally but not on Railway, the issue is likely:
- Railway's internal database URL format
- Network/firewall restrictions
- Service linking issue

## Current Status

The server will start even if the database connection check fails. However, API endpoints that require the database will return 500 errors.

Check Railway logs for:
- `✅ Database connection: OK` - Database is working
- `⚠️  Database connection: FAILED` - Database connection issue

## Next Steps

1. Check Railway Variables → `DATABASE_URL`
2. Verify the format matches PostgreSQL connection string
3. Ensure database service is running
4. Try using Neon database if Railway's internal database isn't working

