import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "./db";
import { 
  profiles, 
  interviewQuestions, 
  interviewSessions, 
  interviewResponses,
  InsertProfile,
  Profile,
  InsertInterviewQuestion,
  InterviewQuestion,
  InsertInterviewSession,
  InterviewSession,
  InsertInterviewResponse,
  InterviewResponse
} from "@shared/schema";

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

  async getQuestionsByRole(role: string): Promise<InterviewQuestion[]> {
    // Return 5 random questions for variety
    const result = await db
      .select()
      .from(interviewQuestions)
      .where(eq(interviewQuestions.role, role))
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
}

export const storage = new DatabaseStorage();
