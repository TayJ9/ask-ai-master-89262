// Load environment variables FIRST
import dotenv from 'dotenv';
dotenv.config();

import { Pool as NeonPool, neonConfig } from '@neondatabase/serverless';
import { Pool as PgPool } from 'pg';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-serverless';
import { drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import ws from "ws";
import * as schema from "../shared/schema";
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Detect database type
const isSqliteDatabase = process.env.DATABASE_URL.startsWith('file:');
const isNeonDatabase = process.env.DATABASE_URL.includes('neon.tech') || 
                       process.env.DATABASE_URL.includes('neon') ||
                       process.env.USE_NEON === 'true';

let pool: NeonPool | PgPool | undefined;
let sqlite: Database | undefined;
let db: ReturnType<typeof drizzlePg>;

if (isSqliteDatabase) {
  // Use SQLite for local development
  const dbPath = process.env.DATABASE_URL.replace('file:', '');
  console.log('🗄️  Using SQLite database:', dbPath);
  
  sqlite = new Database(dbPath);
  // Enable WAL mode for better concurrency
  sqlite.pragma('journal_mode = WAL');
  
  db = drizzleSqlite(sqlite, { schema }) as any;
  
  console.log('✅ SQLite database connected successfully');
} else if (isNeonDatabase) {
  // Use Neon serverless driver for Neon databases
  neonConfig.webSocketConstructor = ws;
  pool = new NeonPool({ connectionString: process.env.DATABASE_URL });
  db = drizzleNeon(pool as any, { schema }) as any;
  
  console.log('✅ Neon database connected successfully');
} else {
  // Use standard PostgreSQL driver for Railway and other standard PostgreSQL instances
  pool = new PgPool({ connectionString: process.env.DATABASE_URL });
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
  
  console.log('✅ PostgreSQL database connected successfully');
}

export { pool, db, sqlite };
