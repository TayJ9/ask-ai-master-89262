import { Pool as NeonPool, neonConfig } from '@neondatabase/serverless';
import { Pool as PgPool } from 'pg';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "../shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Detect if we're using Neon (WebSocket) or standard PostgreSQL
const isNeonDatabase = process.env.DATABASE_URL.includes('neon.tech') || 
                       process.env.DATABASE_URL.includes('neon') ||
                       process.env.USE_NEON === 'true';

let pool: NeonPool | PgPool;
let db: ReturnType<typeof drizzlePg>;

if (isNeonDatabase) {
  // Use Neon serverless driver for Neon databases
  neonConfig.webSocketConstructor = ws;
  pool = new NeonPool({ connectionString: process.env.DATABASE_URL });
  db = drizzleNeon({ client: pool as any, schema }) as any;
} else {
  // Use standard PostgreSQL driver for Railway and other standard PostgreSQL instances
  pool = new PgPool({ connectionString: process.env.DATABASE_URL });
  // Try the older API format: drizzle(pool, { schema })
  // This might be the issue - drizzle-orm 0.29 might use different syntax
  db = drizzlePg(pool, { schema });
  
  // Debug: Verify db.query and db.query.profiles exist
  if (!db.query) {
    console.error('❌ ERROR: db.query is undefined after drizzle initialization!');
    console.error('   Schema keys:', Object.keys(schema));
    console.error('   Schema has profiles:', !!schema.profiles);
    console.error('   db type:', typeof db);
    console.error('   db keys:', Object.keys(db));
    throw new Error('Drizzle query API not initialized. Check schema export.');
  }
  
  // Check if tables are registered
  if (!db.query.profiles) {
    console.error('❌ ERROR: db.query.profiles is undefined!');
    console.error('   db.query keys:', Object.keys(db.query));
    console.error('   Schema keys:', Object.keys(schema));
    console.error('   Schema.profiles type:', typeof schema.profiles);
    console.error('   Schema.profiles:', schema.profiles);
    console.error('   This means drizzle did not register the schema tables.');
    throw new Error('Drizzle schema tables not registered. Check schema export format.');
  }
}

export { pool, db };
