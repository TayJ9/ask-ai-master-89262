-- Fix database schema: Add missing columns to interview_sessions table
-- Run this manually if the migration didn't work

-- Add resume_text column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'interview_sessions' AND column_name = 'resume_text'
    ) THEN
        ALTER TABLE interview_sessions ADD COLUMN resume_text TEXT;
        RAISE NOTICE 'Added resume_text column';
    ELSE
        RAISE NOTICE 'resume_text column already exists';
    END IF;
END $$;

-- Add dialogflow_session_id column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'interview_sessions' AND column_name = 'dialogflow_session_id'
    ) THEN
        ALTER TABLE interview_sessions ADD COLUMN dialogflow_session_id TEXT;
        RAISE NOTICE 'Added dialogflow_session_id column';
    ELSE
        RAISE NOTICE 'dialogflow_session_id column already exists';
    END IF;
END $$;

-- Add difficulty column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'interview_sessions' AND column_name = 'difficulty'
    ) THEN
        ALTER TABLE interview_sessions ADD COLUMN difficulty TEXT;
        RAISE NOTICE 'Added difficulty column';
    ELSE
        RAISE NOTICE 'difficulty column already exists';
    END IF;
END $$;


