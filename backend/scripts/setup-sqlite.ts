/**
 * SQLite Database Setup Script
 * Creates all necessary tables for local development
 * Run with: tsx scripts/setup-sqlite.ts
 */

import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import Database from 'better-sqlite3';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../.env") });

if (!process.env.DATABASE_URL?.startsWith("file:")) {
  console.log("Skipping SQLite setup (DATABASE_URL is not a file: URL).");
  process.exit(0);
}

const dbPath = process.env.DATABASE_URL?.replace("file:", "") || "./local.db";

console.log('🗄️  Setting up SQLite database:', dbPath);

const db = new Database(dbPath);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');

try {
  // Create profiles table
  db.exec(`
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      email TEXT,
      full_name TEXT,
      password_hash TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
  console.log('✅ Created profiles table');

  // Create interview_questions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS interview_questions (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      role TEXT NOT NULL,
      question_text TEXT NOT NULL,
      category TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      order_index INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
  console.log('✅ Created interview_questions table');

  // Create interview_sessions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS interview_sessions (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'in_progress',
      overall_score INTEGER,
      feedback_summary TEXT,
      resume_text TEXT,
      difficulty TEXT,
      started_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT
    );
  `);
  console.log('✅ Created interview_sessions table');

  // Create interview_responses table
  db.exec(`
    CREATE TABLE IF NOT EXISTS interview_responses (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      session_id TEXT NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
      question_id TEXT REFERENCES interview_questions(id) ON DELETE CASCADE,
      transcript TEXT NOT NULL,
      audio_duration_seconds INTEGER,
      score INTEGER,
      strengths TEXT,
      improvements TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
  console.log('✅ Created interview_responses table');

  // Create interview_turns table
  db.exec(`
    CREATE TABLE IF NOT EXISTS interview_turns (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      session_id TEXT NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
      turn_number INTEGER NOT NULL,
      agent_message TEXT,
      user_transcript TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
  console.log('✅ Created interview_turns table');

  // Create interviews table (ElevenLabs voice interviews)
  db.exec(`
    CREATE TABLE IF NOT EXISTS interviews (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      conversation_id TEXT,
      agent_id TEXT NOT NULL,
      transcript TEXT,
      duration_seconds INTEGER,
      started_at TEXT,
      ended_at TEXT,
      status TEXT NOT NULL DEFAULT 'completed',
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
  console.log('✅ Created interviews table');

  // Create interview_evaluations table
  db.exec(`
    CREATE TABLE IF NOT EXISTS interview_evaluations (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      interview_id TEXT NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending',
      overall_score INTEGER,
      evaluation_json TEXT,
      error TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);
  console.log('✅ Created interview_evaluations table');

  // Create elevenlabs_interview_sessions table (client-side session tracking)
  db.exec(`
    CREATE TABLE IF NOT EXISTS elevenlabs_interview_sessions (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      agent_id TEXT NOT NULL,
      client_session_id TEXT NOT NULL UNIQUE,
      conversation_id TEXT UNIQUE,
      interview_id TEXT REFERENCES interviews(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'started',
      ended_by TEXT,
      candidate_context TEXT,
      started_at TEXT DEFAULT (datetime('now')),
      ended_at TEXT,
      client_ended_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);
  console.log('✅ Created elevenlabs_interview_sessions table');

  // Add candidate_context if missing (migration for existing DBs)
  try {
    db.exec(`ALTER TABLE elevenlabs_interview_sessions ADD COLUMN candidate_context TEXT`);
    console.log('✅ Added candidate_context column');
  } catch {
    // Column exists, ignore
  }

  // Create resumes table (resume upload)
  db.exec(`
    CREATE TABLE IF NOT EXISTS resumes (
      interview_id TEXT PRIMARY KEY,
      resume_fulltext TEXT,
      resume_profile TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);
  console.log('✅ Created resumes table');

  // Dedupe before adding unique indexes. Preserve duplicate interview rows by
  // clearing duplicate conversation IDs instead of deleting interviews.
  db.exec(`
    UPDATE interviews
    SET conversation_id = NULL
    WHERE id IN (
      SELECT id
      FROM (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY conversation_id
            ORDER BY
              CASE WHEN transcript IS NOT NULL THEN 0 ELSE 1 END,
              CASE WHEN status = 'completed' THEN 0 ELSE 1 END,
              created_at DESC
          ) AS rn
        FROM interviews
        WHERE conversation_id IS NOT NULL
      )
      WHERE rn > 1
    );

    DELETE FROM interview_evaluations
    WHERE id IN (
      SELECT id
      FROM (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY interview_id
            ORDER BY
              CASE status
                WHEN 'complete' THEN 0
                WHEN 'processing' THEN 1
                WHEN 'pending' THEN 2
                ELSE 3
              END,
              updated_at DESC,
              created_at DESC
          ) AS rn
        FROM interview_evaluations
      )
      WHERE rn > 1
    );
  `);
  console.log('✅ Deduped interviews/evaluations before unique indexes');

  // Create indexes for better performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON interview_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_responses_session_id ON interview_responses(session_id);
    CREATE INDEX IF NOT EXISTS idx_turns_session_id ON interview_turns(session_id);
    CREATE INDEX IF NOT EXISTS idx_interviews_user_id ON interviews(user_id);
    CREATE INDEX IF NOT EXISTS idx_interviews_conversation_id ON interviews(conversation_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_interviews_conversation_id_unique ON interviews(conversation_id) WHERE conversation_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_evaluations_interview_id ON interview_evaluations(interview_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_evaluations_interview_id_unique ON interview_evaluations(interview_id);
    CREATE INDEX IF NOT EXISTS idx_evaluations_status ON interview_evaluations(status);
    CREATE INDEX IF NOT EXISTS idx_elevenlabs_sessions_user_id ON elevenlabs_interview_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_elevenlabs_sessions_client_session_id ON elevenlabs_interview_sessions(client_session_id);
    CREATE INDEX IF NOT EXISTS idx_elevenlabs_sessions_conversation_id ON elevenlabs_interview_sessions(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_elevenlabs_sessions_status ON elevenlabs_interview_sessions(status);
  `);
  console.log('✅ Created indexes');

  console.log('\n✅ SQLite database setup complete!');
  console.log('📁 Database file:', dbPath);

  db.close();
  process.exit(0);
} catch (error: any) {
  console.error('❌ Error setting up SQLite database:', error);
  console.error('Error details:', error.message);
  if (error.stack) {
    console.error('Stack:', error.stack);
  }
  db.close();
  process.exit(1);
}
