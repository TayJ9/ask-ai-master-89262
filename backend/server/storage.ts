import { eq, and, desc, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db, pool, sqlite } from "./db";
import { 
  profiles, 
  interviewQuestions, 
  interviewSessions, 
  interviewResponses,
  interviewTurns,
  interviews,
  interviewEvaluations,
  elevenLabsInterviewSessions,
  InsertProfile,
  Profile,
  InsertInterviewQuestion,
  InterviewQuestion,
  InsertInterviewSession,
  InterviewSession,
  InsertInterviewResponse,
  InterviewResponse,
  InsertInterviewTurn,
  InterviewTurn,
  resumes,
  Resume
} from "../shared/schema";

export interface UserInterviewListItem {
  id: string;
  status: string;
  durationSeconds: number | null;
  startedAt: Date | string | null;
  endedAt: Date | string | null;
  createdAt: Date | string | null;
  overallScore: number | null;
  evaluationStatus: string | null;
  role: string | null;
  major: string | null;
}

export interface IStorage {
  // Profiles
  createProfile(data: InsertProfile): Promise<Profile>;
  getProfileById(id: string): Promise<Profile | undefined>;
  getProfileByEmail(email: string): Promise<Profile | undefined>;
  getProfileByVerificationTokenHash(tokenHash: string): Promise<Profile | undefined>;
  updateProfile(id: string, data: Partial<InsertProfile & {
    emailVerifiedAt?: Date | null;
    emailVerificationTokenHash?: string | null;
    emailVerificationSentAt?: Date | null;
  }>): Promise<void>;
  
  // Voice interviews (history)
  getInterviewsByUserId(userId: string): Promise<UserInterviewListItem[]>;
  
  // Interview Questions
  getQuestionsByRole(role: string): Promise<InterviewQuestion[]>;
  
  // Interview Sessions
  createSession(data: InsertInterviewSession): Promise<InterviewSession>;
  getSessionById(id: string): Promise<InterviewSession | undefined>;
  getSessionsByUserId(userId: string): Promise<InterviewSession[]>;
  updateSession(id: string, data: Partial<InsertInterviewSession>): Promise<void>;
  
  // Interview Responses
  createResponse(data: InsertInterviewResponse): Promise<InterviewResponse>;
  getResponsesBySessionId(sessionId: string): Promise<InterviewResponse[]>;
  
  // Interview Turns
  createTurn(data: InsertInterviewTurn): Promise<InterviewTurn>;
  getTurnsBySessionId(sessionId: string): Promise<InterviewTurn[]>;

  // Resumes
  upsertResume(interviewId: string, resumeFulltext: string, resumeProfile: any, userId?: string | null): Promise<void>;
  getResume(interviewId: string, userId?: string | null): Promise<Resume | undefined>;
}

export class DatabaseStorage implements IStorage {
  private resumeTableReady = false;

  private async ensureResumeTable() {
    if (this.resumeTableReady) return;
    try {
      if (pool) {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS resumes (
            interview_id uuid PRIMARY KEY,
            user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
            resume_fulltext text,
            resume_profile jsonb,
            created_at timestamptz DEFAULT NOW(),
            updated_at timestamptz DEFAULT NOW()
          );
        `);
        await pool.query(`ALTER TABLE resumes ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES profiles(id) ON DELETE CASCADE;`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_resumes_user_id ON resumes(user_id);`);
      } else if (sqlite) {
        sqlite.exec(`
          CREATE TABLE IF NOT EXISTS resumes (
            interview_id TEXT PRIMARY KEY,
            user_id TEXT REFERENCES profiles(id) ON DELETE CASCADE,
            resume_fulltext TEXT,
            resume_profile TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
          );
        `);
        try {
          sqlite.exec(`ALTER TABLE resumes ADD COLUMN user_id TEXT REFERENCES profiles(id) ON DELETE CASCADE`);
        } catch {
          // Column already exists.
        }
        sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_resumes_user_id ON resumes(user_id);`);
      }
      this.resumeTableReady = true;
    } catch (error) {
      console.error("Failed to ensure resumes table exists:", error);
      // Do not throw to avoid crashing startup; operations will fail visibly later.
    }
  }

  async createProfile(data: InsertProfile): Promise<Profile> {
    const isSqlite = process.env.DATABASE_URL?.startsWith("file:");
    const values = isSqlite
      ? { ...data, id: randomUUID(), createdAt: new Date() }
      : data;
    const [profile] = await db.insert(profiles).values(values).returning();
    return profile;
  }

  async getProfileById(id: string): Promise<Profile | undefined> {
    return await db.query.profiles.findFirst({
      where: eq(profiles.id, id),
    });
  }

  async getProfileByEmail(email: string): Promise<Profile | undefined> {
    return await db.query.profiles.findFirst({
      where: eq(profiles.email, email),
    });
  }

  async getProfileByVerificationTokenHash(tokenHash: string): Promise<Profile | undefined> {
    return await db.query.profiles.findFirst({
      where: eq(profiles.emailVerificationTokenHash, tokenHash),
    });
  }

  async updateProfile(
    id: string,
    data: Partial<InsertProfile & {
      emailVerifiedAt?: Date | null;
      emailVerificationTokenHash?: string | null;
      emailVerificationSentAt?: Date | null;
    }>,
  ): Promise<void> {
    await db.update(profiles).set(data).where(eq(profiles.id, id));
  }

  async getInterviewsByUserId(userId: string): Promise<UserInterviewListItem[]> {
    const rows = await db
      .select({
        id: interviews.id,
        status: interviews.status,
        durationSeconds: interviews.durationSeconds,
        startedAt: interviews.startedAt,
        endedAt: interviews.endedAt,
        createdAt: interviews.createdAt,
        overallScore: interviewEvaluations.overallScore,
        evaluationStatus: interviewEvaluations.status,
        candidateContext: elevenLabsInterviewSessions.candidateContext,
      })
      .from(interviews)
      .leftJoin(interviewEvaluations, eq(interviewEvaluations.interviewId, interviews.id))
      .leftJoin(
        elevenLabsInterviewSessions,
        eq(elevenLabsInterviewSessions.interviewId, interviews.id),
      )
      .where(eq(interviews.userId, userId))
      .orderBy(desc(interviews.createdAt));

    return rows.map((row) => {
      const ctx = (row.candidateContext ?? {}) as { role?: string; major?: string };
      return {
        id: row.id,
        status: row.status,
        durationSeconds: row.durationSeconds,
        startedAt: row.startedAt,
        endedAt: row.endedAt,
        createdAt: row.createdAt,
        overallScore: row.overallScore,
        evaluationStatus: row.evaluationStatus,
        role: ctx.role ?? "General Interview",
        major: ctx.major ?? null,
      };
    });
  }

  async getQuestionsByRole(role: string, difficulty?: string): Promise<InterviewQuestion[]> {
    // If difficulty specified, filter by it; otherwise return any difficulty
    const conditions = difficulty 
      ? and(eq(interviewQuestions.role, role), eq(interviewQuestions.difficulty, difficulty))
      : eq(interviewQuestions.role, role);
    
    const result = await db
      .select()
      .from(interviewQuestions)
      .where(conditions)
      .orderBy(sql`RANDOM()`)
      .limit(5);
    
    return result;
  }

  async createSession(data: InsertInterviewSession): Promise<InterviewSession> {
    const [session] = await db.insert(interviewSessions).values(data).returning();
    return session;
  }

  async getSessionById(id: string): Promise<InterviewSession | undefined> {
    return await db.query.interviewSessions.findFirst({
      where: eq(interviewSessions.id, id),
    });
  }

  async getSessionsByUserId(userId: string): Promise<InterviewSession[]> {
    return await db.query.interviewSessions.findMany({
      where: eq(interviewSessions.userId, userId),
      orderBy: [desc(interviewSessions.startedAt)],
    });
  }

  async updateSession(id: string, data: Partial<InsertInterviewSession>): Promise<void> {
    await db.update(interviewSessions).set(data).where(eq(interviewSessions.id, id));
  }

  async createResponse(data: InsertInterviewResponse): Promise<InterviewResponse> {
    const [response] = await db.insert(interviewResponses).values(data).returning();
    return response;
  }

  async getResponsesBySessionId(sessionId: string): Promise<InterviewResponse[]> {
    return await db.query.interviewResponses.findMany({
      where: eq(interviewResponses.sessionId, sessionId),
      orderBy: [interviewResponses.createdAt],
    });
  }

  async createTurn(data: InsertInterviewTurn): Promise<InterviewTurn> {
    const [turn] = await db.insert(interviewTurns).values(data).returning();
    return turn;
  }

  async getTurnsBySessionId(sessionId: string): Promise<InterviewTurn[]> {
    return await db.query.interviewTurns.findMany({
      where: eq(interviewTurns.sessionId, sessionId),
      orderBy: [interviewTurns.turnNumber, interviewTurns.createdAt],
    });
  }

  async upsertResume(interviewId: string, resumeFulltext: string, resumeProfile: any, userId?: string | null): Promise<void> {
    await this.ensureResumeTable();
    try {
      if (userId) {
        const existingResume = await (db.query as any).resumes?.findFirst({
          where: eq(resumes.interviewId, interviewId),
        });
        if (existingResume?.userId && existingResume.userId !== userId) {
          throw new Error("Resume is owned by a different user");
        }
      }
      const now = new Date();
      const values = pool
        ? { interviewId, userId: userId ?? null, resumeFulltext, resumeProfile }
        : { interviewId, userId: userId ?? null, resumeFulltext, resumeProfile, createdAt: now, updatedAt: now };
      const updateSet: Record<string, unknown> = {
        resumeFulltext,
        resumeProfile,
        updatedAt: pool ? sql`NOW()` : sql`datetime('now')`,
      };
      if (userId) {
        updateSet.userId = userId;
      }
      await db.insert(resumes).values(values).onConflictDoUpdate({
        target: resumes.interviewId,
        set: updateSet,
      });
    } catch (error) {
      console.error("Failed to upsert resume:", error);
      throw error;
    }
  }

  async getResume(interviewId: string, userId?: string | null): Promise<Resume | undefined> {
    await this.ensureResumeTable();
    const whereClause = userId
      ? and(eq(resumes.interviewId, interviewId), eq(resumes.userId, userId))
      : eq(resumes.interviewId, interviewId);
    return await (db.query as any).resumes?.findFirst({
      where: whereClause,
    });
  }

  async checkDbConnection(): Promise<boolean> {
    try {
      // Check if we're using SQLite (no pool)
      const isSqlite = process.env.DATABASE_URL?.startsWith('file:');
      
      if (isSqlite) {
        // For SQLite, just try a simple query using drizzle
        await db.query.profiles.findFirst();
        return true;
      }
      
      // For PostgreSQL/Neon, use pool.query
      if (!pool) {
        console.error('   Pool is undefined - database connection not initialized');
        return false;
      }
      
      // Handle both Neon serverless (pool.query) and standard PostgreSQL (pool.query)
      // Add a timeout to prevent hanging
      const queryPromise = (pool as any).query('SELECT 1');
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Database connection timeout')), 5000)
      );
      
      await Promise.race([queryPromise, timeoutPromise]);
      return true;
    } catch (error: any) {
      console.error("Database connection check failed:", error);
      // Log more details about the error
      if (error?.code === 'ECONNREFUSED') {
        console.error('   Connection refused - check DATABASE_URL and database accessibility');
        console.error('   If using Railway PostgreSQL, ensure service is linked and running');
        console.error('   Verify DATABASE_URL points to the correct host and port');
      } else if (error?.message?.includes('timeout')) {
        console.error('   Connection timeout - database may be slow or unreachable');
      } else if (error?.message?.includes('WebSocket') || error?.type === 'error') {
        console.error('   WebSocket connection failed - this might indicate wrong driver');
        console.error('   If using Railway PostgreSQL, ensure standard PostgreSQL driver is used');
      } else {
        console.error('   Error details:', error?.message || error);
      }
      return false;
    }
  }
}

export const storage = new DatabaseStorage();
