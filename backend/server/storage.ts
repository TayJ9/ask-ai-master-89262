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
  InterviewTurn
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
}

export class DatabaseStorage implements IStorage {
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

  async checkDbConnection(): Promise<boolean> {
    try {
      // Neon serverless Pool uses pool.query() directly (no connect() method)
      // Add a timeout to prevent hanging
      const queryPromise = pool.query('SELECT 1');
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
      } else if (error?.message?.includes('timeout')) {
        console.error('   Connection timeout - database may be slow or unreachable');
      } else if (error?.message?.includes('WebSocket') || error?.type === 'error') {
        console.error('   WebSocket connection failed - check DATABASE_URL format');
        console.error('   DATABASE_URL should be a PostgreSQL connection string');
        console.error('   Example: postgresql://user:pass@host:5432/db?sslmode=require');
      }
      return false;
    }
  }
}

export const storage = new DatabaseStorage();
