/**
 * Database Setup Script
 * Creates all necessary tables in the database
 * Run with: tsx scripts/setup-db.ts
 */

import { db } from '../server/db';
import { sql } from 'drizzle-orm';

async function setupDatabase() {
  try {
    console.log('Setting up database tables...');

    // Create profiles table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS profiles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT,
        full_name TEXT,
        password_hash TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Create interview_questions table
    await db.execute(sql`
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

    // Create interview_sessions table
    await db.execute(sql`
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

    // Create interview_responses table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS interview_responses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id UUID NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
        question_id UUID,
        transcript TEXT,
        score INTEGER,
        strengths TEXT[],
        improvements TEXT[],
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Create interview_turns table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS interview_turns (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id UUID NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
        turn_number INTEGER NOT NULL,
        agent_message TEXT,
        user_transcript TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Create indexes for better performance
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
      CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON interview_sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_responses_session_id ON interview_responses(session_id);
      CREATE INDEX IF NOT EXISTS idx_turns_session_id ON interview_turns(session_id);
    `);

    console.log('✅ Database tables created successfully!');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error setting up database:', error);
    console.error('Error details:', error.message);
    process.exit(1);
  }
}

setupDatabase();

