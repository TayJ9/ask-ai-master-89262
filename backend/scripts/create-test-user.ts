/**
 * Dev-only: upsert a local test user (SQLite or configured DB).
 *
 * Credentials are read from environment — never hardcoded — so nothing secret is committed.
 *
 * Usage (from backend/):
 *   npm run create-test-user
 *
 * Requires in backend/.env (or env):
 *   DEV_TEST_PASSWORD=<your local-only password>
 *
 * Optional:
 *   DEV_TEST_EMAIL=dev@localhost.test
 *   DEV_TEST_FULL_NAME=Local Dev User
 */

import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "../server/db";
import { storage } from "../server/storage";
import { profiles } from "../shared/schema";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../.env") });

async function createTestUser() {
  if (process.env.NODE_ENV === "production") {
    console.error(
      "create-test-user: refused (NODE_ENV=production). This script is for local development only."
    );
    process.exit(1);
  }

  const email = (process.env.DEV_TEST_EMAIL || "dev@localhost.test")
    .toLowerCase()
    .trim();
  const password = process.env.DEV_TEST_PASSWORD?.trim();
  const fullName = (process.env.DEV_TEST_FULL_NAME || "Local Dev User").trim();

  if (!password || password.length < 8) {
    console.error(
      "create-test-user: set DEV_TEST_PASSWORD in backend/.env (at least 8 characters).\n" +
        "Example:\n  DEV_TEST_PASSWORD=your_local_secret_only\n" +
        "Optional: DEV_TEST_EMAIL, DEV_TEST_FULL_NAME\n" +
        "Never commit real passwords; .env is gitignored."
    );
    process.exit(1);
  }

  console.log("Creating / updating dev test user…");
  console.log(`  Email: ${email}`);
  console.log(`  Name:  ${fullName}`);

  const passwordHash = await bcrypt.hash(password, 10);
  const existing = await storage.getProfileByEmail(email);

  if (existing) {
    await db
      .update(profiles)
      .set({ passwordHash, fullName })
      .where(eq(profiles.email, email));
    console.log("✅ User already existed; password and name updated.");
    console.log(`   User ID: ${existing.id}`);
  } else {
    // Explicit id: SQLite has no gen_random_uuid(); Postgres accepts a client UUID too.
    const [profile] = await db
      .insert(profiles)
      .values({
        id: randomUUID(),
        email,
        fullName,
        passwordHash,
        createdAt: new Date(),
      })
      .returning();
    console.log("✅ Test user created.");
    console.log(`   User ID: ${profile.id}`);
  }

  console.log("");
  console.log("Sign in at http://localhost:5173 with the email above and DEV_TEST_PASSWORD.");
}

createTestUser()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("create-test-user failed:", err);
    process.exit(1);
  });
