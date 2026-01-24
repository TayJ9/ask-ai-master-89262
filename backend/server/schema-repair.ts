/**
 * Schema Repair Module
 * Can be imported and called during app startup to ensure tables exist
 */

import { pool } from './db';

/**
 * Schema Repair Function
 * Fixes production database schema issues using RAW SQL:
 * 1. Enables UUID extensions (pgcrypto, uuid-ossp)
 * 2. Fixes elevenlabs_interview_sessions.id column DEFAULT value
 * 3. Creates missing interviews table
 * 4. Creates missing interview_evaluations table
 */
export async function repairSchema(): Promise<void> {
  try {
    console.log('🔧 Running schema repair...');

    // Skip schema repair for SQLite (tables already created by setup script)
    const isSqlite = process.env.DATABASE_URL?.startsWith('file:');
    if (isSqlite) {
      console.log('✅ SQLite detected - skipping schema repair (not needed for SQLite)');
      return;
    }

    // Handle both Neon (pool.query) and standard PostgreSQL (pool.connect)
    const isNeon = process.env.DATABASE_URL?.includes('neon.tech') || 
                   process.env.DATABASE_URL?.includes('neon') ||
                   process.env.USE_NEON === 'true';

    const executeQuery = async (query: string) => {
      if (isNeon) {
        // Neon serverless uses pool.query directly
        return await (pool as any).query(query);
      } else {
        // Standard PostgreSQL uses pool.connect()
        const client = await (pool as any).connect();
        try {
          return await client.query(query);
        } finally {
          client.release();
        }
      }
    };

    // Execute RAW SQL migration block
    console.log('📦 Executing schema repair SQL...');
    
    // 1. Enable UUID extensions
    await executeQuery(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);
    await executeQuery(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);
    console.log('✅ UUID extensions enabled');
    
    // 2. Fix elevenlabs_interview_sessions.id column DEFAULT value
    await executeQuery(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'elevenlabs_interview_sessions'
        ) THEN
          ALTER TABLE elevenlabs_interview_sessions 
          ALTER COLUMN id SET DEFAULT gen_random_uuid();
        END IF;
      END $$;
    `);
    console.log('✅ Fixed elevenlabs_interview_sessions.id DEFAULT value');

    // 3. Create interviews table if missing
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS interviews (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        conversation_id TEXT,
        agent_id TEXT NOT NULL,
        transcript TEXT,
        duration_seconds INTEGER,
        started_at TIMESTAMP,
        ended_at TIMESTAMP,
        status TEXT NOT NULL DEFAULT 'completed',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✅ Created/verified interviews table');

    // 4. Create interview_evaluations table if missing
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS interview_evaluations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        interview_id UUID NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'pending',
        overall_score INTEGER,
        evaluation_json JSONB,
        error TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✅ Created/verified interview_evaluations table');

    // 5. Create indexes for interviews table
    await executeQuery(`CREATE INDEX IF NOT EXISTS idx_interviews_user_id ON interviews(user_id);`);
    await executeQuery(`CREATE INDEX IF NOT EXISTS idx_interviews_conversation_id ON interviews(conversation_id);`);
    console.log('✅ Created/verified indexes for interviews table');

    // 6. Create indexes for interview_evaluations table
    await executeQuery(`CREATE INDEX IF NOT EXISTS idx_evaluations_interview_id ON interview_evaluations(interview_id);`);
    await executeQuery(`CREATE INDEX IF NOT EXISTS idx_evaluations_status ON interview_evaluations(status);`);
    console.log('✅ Created/verified indexes for interview_evaluations table');
    
    console.log('✅ Schema repair completed successfully!');
  } catch (error: any) {
    console.error('❌ Error during schema repair:', error);
    console.error('Error details:', error.message);
    if (error.stack) {
      console.error('Stack:', error.stack);
    }
    // Don't throw - allow app to start even if repair fails (non-critical)
    console.warn('⚠️  Continuing with app startup despite schema repair error...');
  }
}
