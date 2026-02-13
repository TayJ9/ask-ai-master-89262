/**
 * Script to create a test user for local development
 * Usage: tsx scripts/create-test-user.ts
 */

import { db } from "../server/db";
import { profiles } from "../shared/schema";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

const TEST_USER = {
  email: 'test@example.com',
  password: 'test123456',
  fullName: 'Test User'
};

async function createTestUser() {
  try {
    console.log('🔧 Creating test user...');
    console.log(`Email: ${TEST_USER.email}`);
    console.log(`Password: ${TEST_USER.password}`);
    
    // Check if user already exists
    const existing = await db.select().from(profiles).where(eq(profiles.email, TEST_USER.email.toLowerCase())).limit(1);
    
    if (existing.length > 0) {
      console.log('ℹ️  Test user already exists. Updating password...');
      
      // Update password
      const passwordHash = await bcrypt.hash(TEST_USER.password, 10);
      await db.update(profiles)
        .set({ passwordHash })
        .where(eq(profiles.email, TEST_USER.email.toLowerCase()));
      
      console.log('✅ Test user password updated!');
      console.log(`User ID: ${existing[0].id}`);
      return existing[0];
    }
    
    // Create new user
    const passwordHash = await bcrypt.hash(TEST_USER.password, 10);
    
    const [newUser] = await db.insert(profiles).values({
      email: TEST_USER.email.toLowerCase(),
      passwordHash,
      fullName: TEST_USER.fullName,
    }).returning();
    
    console.log('✅ Test user created successfully!');
    console.log(`User ID: ${newUser.id}`);
    console.log(`Email: ${newUser.email}`);
    console.log('');
    console.log('📋 Test User Credentials:');
    console.log(`   Email: ${TEST_USER.email}`);
    console.log(`   Password: ${TEST_USER.password}`);
    console.log('');
    console.log('🔗 Sign in at: http://localhost:5173');
    
    return newUser;
  } catch (error: any) {
    console.error('❌ Error creating test user:', error);
    if (error.message?.includes('relation') && error.message?.includes('does not exist')) {
      console.error('💡 Database tables not created. Run: npm run db:setup');
    }
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  createTestUser()
    .then(() => {
      console.log('✅ Done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Failed:', error);
      process.exit(1);
    });
}

export { createTestUser };
