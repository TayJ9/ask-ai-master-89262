/**
 * Delete a specific user from the database
 * Run with: tsx scripts/delete-user.ts
 */

import dotenv from 'dotenv';
dotenv.config();

import { db } from '../server/db';

const emailToDelete = 'tayjson20@gmail.com';

async function deleteUser() {
  try {
    console.log(`🔍 Looking for user: ${emailToDelete}`);
    
    // First, check if user exists
    const user = await db.query.profiles.findFirst({
      where: (profiles, { eq }) => eq(profiles.email, emailToDelete),
      columns: { id: true, email: true, full_name: true }
    });

    if (!user) {
      console.log('❌ User not found in database');
      process.exit(0);
    }

    console.log('✅ User found:', user);
    console.log('🗑️  Deleting user...');

    // Delete the user (CASCADE will delete related data)
    await db.delete(profiles).where(eq(profiles.email, emailToDelete));

    console.log('✅ User deleted successfully!');
    console.log('   All related interview data has been removed as well.');
    
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error deleting user:', error.message);
    process.exit(1);
  }
}

deleteUser();
