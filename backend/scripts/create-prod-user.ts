/**
 * Production user upsert — requires explicit confirmation to prevent accidental runs.
 *
 * Usage (from backend/ or via workspace):
 *   CREATE_USER_CONFIRM=1 \
 *   PROD_USER_EMAIL=invitee@example.com \
 *   PROD_USER_PASSWORD='secure-password' \
 *   PROD_USER_FULL_NAME='Invitee Name' \
 *   npm run create-prod-user
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

async function createProdUser() {
  if (process.env.CREATE_USER_CONFIRM !== "1") {
    console.error(
      "create-prod-user: refused. Set CREATE_USER_CONFIRM=1 to confirm this intentional run.",
    );
    process.exit(1);
  }

  const email = process.env.PROD_USER_EMAIL?.toLowerCase().trim();
  const password = process.env.PROD_USER_PASSWORD?.trim();
  const fullName = process.env.PROD_USER_FULL_NAME?.trim();

  if (!email || !password || !fullName) {
    console.error(
      "create-prod-user: PROD_USER_EMAIL, PROD_USER_PASSWORD, and PROD_USER_FULL_NAME are required.",
    );
    process.exit(1);
  }

  if (password.length < 8) {
    console.error("create-prod-user: PROD_USER_PASSWORD must be at least 8 characters.");
    process.exit(1);
  }

  console.log("Creating / updating production user…");
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
    console.log("✅ User created.");
    console.log(`   User ID: ${profile.id}`);
  }
}

createProdUser()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("create-prod-user failed:", err);
    process.exit(1);
  });
