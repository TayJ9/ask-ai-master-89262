import { Pool as NeonPool, neonConfig } from '@neondatabase/serverless';
import { Pool as PgPool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
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
let db: ReturnType<typeof drizzle>;

if (isNeonDatabase) {
  // Use Neon serverless driver for Neon databases
  neonConfig.webSocketConstructor = ws;
  pool = new NeonPool({ connectionString: process.env.DATABASE_URL });
  // Import drizzle for Neon serverless
  const { drizzle: drizzleNeon } = await import('drizzle-orm/neon-serverless');
  db = drizzleNeon({ client: pool as any, schema });
} else {
  // Use standard PostgreSQL driver for Railway and other standard PostgreSQL instances
  pool = new PgPool({ connectionString: process.env.DATABASE_URL });
  db = drizzle({ client: pool, schema });
}

export { pool, db };
