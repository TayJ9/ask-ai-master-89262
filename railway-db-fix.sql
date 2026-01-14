-- ============================================
-- Railway Database Schema Repair SQL
-- Paste this entire block into Railway Query Editor
-- ============================================

-- Step 1: Fix elevenlabs_interview_sessions.id column DEFAULT value
-- This adds gen_random_uuid() as the default if it's missing
ALTER TABLE elevenlabs_interview_sessions 
ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- Step 2: Create interviews table (if it doesn't exist)
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

-- Step 3: Create indexes for interviews table (for better query performance)
CREATE INDEX IF NOT EXISTS idx_interviews_user_id ON interviews(user_id);
CREATE INDEX IF NOT EXISTS idx_interviews_conversation_id ON interviews(conversation_id);

-- ============================================
-- Verification Queries (optional - run separately to verify)
-- ============================================
-- Check if elevenlabs_interview_sessions.id has a default:
-- SELECT column_default 
-- FROM information_schema.columns 
-- WHERE table_schema = 'public' 
--   AND table_name = 'elevenlabs_interview_sessions' 
--   AND column_name = 'id';

-- Check if interviews table exists:
-- SELECT EXISTS (
--   SELECT FROM information_schema.tables 
--   WHERE table_schema = 'public' 
--   AND table_name = 'interviews'
-- );
