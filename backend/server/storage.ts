import { eq, and, desc, sql } from "drizzle-orm";
import { db, pool } from "./db";
import { 
  profiles, 
  interviewQuestions, 
  interviewSessions, 
  interviewResponses,
  interviewTurns,
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

export interface IStorage {
  // Profiles
  createProfile(data: InsertProfile): Promise<Profile>;
  getProfileById(id: string): Promise<Profile | undefined>;
  getProfileByEmail(email: string): Promise<Profile | undefined>;
  
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
  upsertResume(interviewId: string, resumeFulltext: string, resumeProfile: any): Promise<void>;
  getResume(interviewId: string): Promise<Resume | undefined>;
}

export class DatabaseStorage implements IStorage {
  private resumeTableReady = false;

  private async ensureResumeTable() {
    if (this.resumeTableReady) return;
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS resumes (
          interview_id uuid PRIMARY KEY,
          resume_fulltext text,
          resume_profile jsonb,
          created_at timestamptz DEFAULT NOW(),
          updated_at timestamptz DEFAULT NOW()
        );
      `);
      this.resumeTableReady = true;
    } catch (error) {
      console.error("Failed to ensure resumes table exists:", error);
      // Do not throw to avoid crashing startup; operations will fail visibly later.
    }
  }

  async createProfile(data: InsertProfile): Promise<Profile> {
    const [profile] = await db.insert(profiles).values(data).returning();
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

  async upsertResume(interviewId: string, resumeFulltext: string, resumeProfile: any): Promise<void> {
    await this.ensureResumeTable();
    try {
      await db.insert(resumes).values({
        interviewId,
        resumeFulltext,
        resumeProfile,
      }).onConflictDoUpdate({
        target: resumes.interviewId,
        set: {
          resumeFulltext,
          resumeProfile,
          updatedAt: sql`NOW()`,
        },
      });
    } catch (error) {
      console.error("Failed to upsert resume:", error);
      throw error;
    }
  }

  async getResume(interviewId: string): Promise<Resume | undefined> {
    await this.ensureResumeTable();
    return await db.query.resumes.findFirst({
      where: eq(resumes.interviewId, interviewId),
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
