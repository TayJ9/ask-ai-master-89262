/**
 * Database Setup Script
 * Creates all necessary tables in the database
 * Run with: tsx scripts/setup-db.ts
 */

import { pool } from '../server/db';

async function setupDatabase() {
  try {
    console.log('Setting up database tables...');

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

    // Check if profiles table exists (if it does, all tables likely exist)
    const tablesExist = await checkTableExists('profiles');
    if (tablesExist) {
      console.log('✅ Database tables already exist. Skipping creation.');
      console.log('✅ Database setup complete!');
      process.exit(0);
      return;
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

    // Create indexes for better performance
    await executeQuery(`
        CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
        CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON interview_sessions(user_id);
        CREATE INDEX IF NOT EXISTS idx_responses_session_id ON interview_responses(session_id);
        CREATE INDEX IF NOT EXISTS idx_turns_session_id ON interview_turns(session_id);
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

