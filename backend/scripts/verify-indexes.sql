-- Database Index Verification Script
-- Run this in your production database to verify indexes exist
-- Expected indexes for performance optimization:

-- Verify indexes exist
SELECT 
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename IN ('interviews', 'interview_evaluations', 'elevenlabs_interview_sessions')
  AND (
    indexname LIKE '%conversation%' 
    OR indexname LIKE '%session%'
    OR indexname LIKE '%interview_id%'
  )
ORDER BY tablename, indexname;

-- If any indexes are missing, create them:
CREATE INDEX IF NOT EXISTS idx_interviews_conversation_id ON interviews(conversation_id);
CREATE INDEX IF NOT EXISTS idx_elevenlabs_sessions_conversation_id ON elevenlabs_interview_sessions(conversation_id);
CREATE INDEX IF NOT EXISTS idx_elevenlabs_sessions_client_session_id ON elevenlabs_interview_sessions(client_session_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_interview_id ON interview_evaluations(interview_id);
