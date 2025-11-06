/**
 * Script to manually fix database schema if migration didn't work
 * Run: tsx fix_schema.ts
 */

import { Pool } from '@neondatabase/serverless';
import ws from 'ws';
import * as schema from './shared/schema';

// Configure WebSocket for Neon
const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL 
});

// Set WebSocket constructor for Neon
(global as any).WebSocket = ws;

async function fixSchema() {
  console.log('🔧 Fixing database schema...');
  
  const client = await pool.connect();
  
  try {
    // Check current columns
    const columnsResult = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'interview_sessions' 
      ORDER BY column_name
    `);
    
    const existingColumns = columnsResult.rows.map((r: any) => r.column_name);
    console.log('📋 Existing columns:', existingColumns);
    
    // Add missing columns
    const columnsToAdd = [
      { name: 'resume_text', type: 'TEXT' },
      { name: 'dialogflow_session_id', type: 'TEXT' },
      { name: 'difficulty', type: 'TEXT' }
    ];
    
    for (const col of columnsToAdd) {
      if (!existingColumns.includes(col.name)) {
        console.log(`➕ Adding column: ${col.name}`);
        await client.query(`ALTER TABLE interview_sessions ADD COLUMN ${col.name} ${col.type}`);
        console.log(`✅ Added ${col.name}`);
      } else {
        console.log(`✓ Column ${col.name} already exists`);
      }
    }
    
    // Verify interview_turns table exists
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'interview_turns'
    `);
    
    if (tablesResult.rows.length === 0) {
      console.log('➕ Creating interview_turns table...');
      await client.query(`
        CREATE TABLE interview_turns (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          session_id UUID NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
          turn_number INTEGER NOT NULL,
          agent_message TEXT,
          user_transcript TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      console.log('✅ Created interview_turns table');
    } else {
      console.log('✓ interview_turns table already exists');
    }
    
    console.log('✅ Schema fix complete!');
  } catch (error: any) {
    console.error('❌ Error fixing schema:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

fixSchema()
  .then(() => {
    console.log('✨ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Failed:', error);
    process.exit(1);
  });


