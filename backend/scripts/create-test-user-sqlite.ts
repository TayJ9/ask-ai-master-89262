/**
 * Create a test user in SQLite database
 */

import dotenv from 'dotenv';
dotenv.config();

import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

const dbPath = process.env.DATABASE_URL?.replace('file:', '') || './local.db';
const db = new Database(dbPath);

const email = 'test123@gmail.com';
const password = 'Test123';
const fullName = 'Test User';

async function createTestUser() {
  try {
    // Check if user already exists
    const existingUser = db.prepare('SELECT * FROM profiles WHERE email = ?').get(email);
    
    if (existingUser) {
      console.log('✅ Test user already exists!');
      console.log(`   Email: ${email}`);
      console.log(`   Password: ${password}`);
      db.close();
      return;
    }

    // Hash the password
    const passwordHash = await bcrypt.hash(password, 10);
    const userId = randomUUID();

    // Insert the user
    db.prepare(`
      INSERT INTO profiles (id, email, full_name, password_hash)
      VALUES (?, ?, ?, ?)
    `).run(userId, email, fullName, passwordHash);

    console.log('✅ Test user created successfully!');
    console.log(`   Email: ${email}`);
    console.log(`   Password: ${password}`);
    console.log(`   User ID: ${userId}`);

    db.close();
  } catch (error: any) {
    console.error('❌ Error creating test user:', error.message);
    db.close();
    process.exit(1);
  }
}

createTestUser();
