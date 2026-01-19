/**
 * Database Setup Script
 * Creates all necessary tables in the database
 * Run with: tsx scripts/setup-db.ts
 */

import { repairSchema } from '../server/schema-repair';
import { pool } from '../server/db';

async function setupDatabase() {
  try {
    console.log('Setting up database tables...');

    // Always run schema repair first (fixes production issues)
    await repairSchema();

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

    // Check if tables already exist to avoid unnecessary work
    const checkTableExists = async (tableName: string): Promise<boolean> => {
      try {
        // Escape table name to prevent SQL injection (though it's from our code, not user input)
        const escapedTableName = tableName.replace(/"/g, '""');
        const result = await executeQuery(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = '${escapedTableName}'
          );
        `);
        return result.rows?.[0]?.exists || false;
      } catch (error) {
        // If query fails, assume table doesn't exist and proceed
        console.log(`⚠️  Could not check if table exists: ${(error as Error).message}`);
        return false;
      }
    };

    // Check if all required tables exist (don't assume all tables exist just because profiles does)
    const requiredTables = [
      'profiles',
      'interviews',
      'interview_evaluations',
      'elevenlabs_interview_sessions'
    ];
    
    const tableExistence = await Promise.all(
      requiredTables.map(table => checkTableExists(table))
    );
    
    const allTablesExist = tableExistence.every(exists => exists);
    
    if (allTablesExist) {
      console.log('✅ All required database tables already exist. Skipping creation.');
      console.log('✅ Database setup complete!');
      process.exit(0);
      return;
    }
    
    // Log which tables are missing
    const missingTables = requiredTables.filter((_, index) => !tableExistence[index]);
    if (missingTables.length > 0) {
      console.log(`⚠️  Missing tables detected: ${missingTables.join(', ')}`);
      console.log('⚠️  Creating missing tables...');
    }

    // Create profiles table
    await executeQuery(`
        CREATE TABLE IF NOT EXISTS profiles (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          email TEXT,
          full_name TEXT,
          password_hash TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        );
      `);
    console.log('✅ Created profiles table');

    // Create interview_questions table
    await executeQuery(`
        CREATE TABLE IF NOT EXISTS interview_questions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          role TEXT NOT NULL,
          question_text TEXT NOT NULL,
          category TEXT NOT NULL,
          difficulty TEXT NOT NULL,
          order_index INTEGER NOT NULL,
          created_at TIMESTAMP DEFAULT NOW()
        );
      `);
    console.log('✅ Created interview_questions table');

    // Create interview_sessions table
    await executeQuery(`
        CREATE TABLE IF NOT EXISTS interview_sessions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
          role TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'in_progress',
          overall_score INTEGER,
          feedback_summary TEXT,
          resume_text TEXT,
          difficulty TEXT,
          started_at TIMESTAMP DEFAULT NOW(),
          completed_at TIMESTAMP
        );
      `);
    console.log('✅ Created interview_sessions table');

    // Create interview_responses table
    await executeQuery(`
        CREATE TABLE IF NOT EXISTS interview_responses (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          session_id UUID NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
          question_id UUID REFERENCES interview_questions(id) ON DELETE CASCADE,
          transcript TEXT NOT NULL,
          audio_duration_seconds INTEGER,
          score INTEGER,
          strengths TEXT[],
          improvements TEXT[],
          created_at TIMESTAMP DEFAULT NOW()
        );
      `);
    console.log('✅ Created interview_responses table');

    // Create interview_turns table
    await executeQuery(`
        CREATE TABLE IF NOT EXISTS interview_turns (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          session_id UUID NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
          turn_number INTEGER NOT NULL,
          agent_message TEXT,
          user_transcript TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        );
      `);
    console.log('✅ Created interview_turns table');

    // Create interviews table (ElevenLabs voice interviews)
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
    console.log('✅ Created interviews table');

    // Create interview_evaluations table
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
    console.log('✅ Created interview_evaluations table');

    // Create elevenlabs_interview_sessions table (client-side session tracking)
    await executeQuery(`
        CREATE TABLE IF NOT EXISTS elevenlabs_interview_sessions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
          agent_id TEXT NOT NULL,
          client_session_id TEXT NOT NULL,
          conversation_id TEXT,
          interview_id UUID REFERENCES interviews(id) ON DELETE SET NULL,
          status TEXT NOT NULL DEFAULT 'started',
          ended_by TEXT,
          started_at TIMESTAMP DEFAULT NOW(),
          ended_at TIMESTAMP,
          client_ended_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(client_session_id),
          UNIQUE(conversation_id)
        );
      `);
    console.log('✅ Created elevenlabs_interview_sessions table');

    // Create indexes for better performance
    await executeQuery(`
        CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
        CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON interview_sessions(user_id);
        CREATE INDEX IF NOT EXISTS idx_responses_session_id ON interview_responses(session_id);
        CREATE INDEX IF NOT EXISTS idx_turns_session_id ON interview_turns(session_id);
        CREATE INDEX IF NOT EXISTS idx_interviews_user_id ON interviews(user_id);
        CREATE INDEX IF NOT EXISTS idx_interviews_conversation_id ON interviews(conversation_id);
        CREATE INDEX IF NOT EXISTS idx_evaluations_interview_id ON interview_evaluations(interview_id);
        CREATE INDEX IF NOT EXISTS idx_evaluations_status ON interview_evaluations(status);
        CREATE INDEX IF NOT EXISTS idx_elevenlabs_sessions_user_id ON elevenlabs_interview_sessions(user_id);
        CREATE INDEX IF NOT EXISTS idx_elevenlabs_sessions_client_session_id ON elevenlabs_interview_sessions(client_session_id);
        CREATE INDEX IF NOT EXISTS idx_elevenlabs_sessions_conversation_id ON elevenlabs_interview_sessions(conversation_id);
        CREATE INDEX IF NOT EXISTS idx_elevenlabs_sessions_status ON elevenlabs_interview_sessions(status);
      `);
    console.log('✅ Created indexes');

    console.log('\n✅ Database tables created successfully!');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error setting up database:', error);
    console.error('Error details:', error.message);
    if (error.stack) {
      console.error('Stack:', error.stack);
    }
    process.exit(1);
  }
}

setupDatabase();

