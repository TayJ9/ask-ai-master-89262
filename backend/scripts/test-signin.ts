/**
 * Test signin directly to see what's happening
 */

import dotenv from 'dotenv';
dotenv.config();

import { db } from "../server/db";
import { profiles } from "../shared/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

async function testSignin() {
  try {
    const email = 'test123@gmail.com';
    const password = 'Test123';
    
    console.log('🔍 Testing signin for:', email);
    
    // Check if user exists
    const user = await db.select().from(profiles).where(eq(profiles.email, email.toLowerCase())).limit(1);
    
    if (user.length === 0) {
      console.error('❌ User not found in database!');
      return;
    }
    
    console.log('✅ User found:', {
      id: user[0].id,
      email: user[0].email,
      hasPassword: !!user[0].passwordHash,
      passwordHashLength: user[0].passwordHash?.length || 0
    });
    
    // Test password
    if (!user[0].passwordHash) {
      console.error('❌ User has no password hash!');
      return;
    }
    
    const isValid = await bcrypt.compare(password, user[0].passwordHash);
    console.log('🔐 Password check:', isValid ? '✅ Valid' : '❌ Invalid');
    
    if (!isValid) {
      console.log('⚠️  Password doesn\'t match. Updating password hash...');
      const newHash = await bcrypt.hash(password, 10);
      await db.update(profiles)
        .set({ passwordHash: newHash })
        .where(eq(profiles.email, email.toLowerCase()));
      console.log('✅ Password hash updated!');
      
      // Test again
      const isValidAfter = await bcrypt.compare(password, newHash);
      console.log('🔐 Password check after update:', isValidAfter ? '✅ Valid' : '❌ Invalid');
    }
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    process.exit(0);
  }
}

testSignin();
