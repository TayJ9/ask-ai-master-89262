import { pgTable, text, uuid, integer, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { sql } from "drizzle-orm";

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email"),
  fullName: text("full_name"),
  passwordHash: text("password_hash"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertProfileSchema = createInsertSchema(profiles).omit({ 
  id: true, 
  createdAt: true 
});
export type InsertProfile = z.infer<typeof insertProfileSchema>;
export type Profile = typeof profiles.$inferSelect;

export const interviewQuestions = pgTable("interview_questions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  role: text("role").notNull(),
  questionText: text("question_text").notNull(),
  category: text("category").notNull(),
  difficulty: text("difficulty").notNull(),
  orderIndex: integer("order_index").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertInterviewQuestionSchema = createInsertSchema(interviewQuestions).omit({ 
  id: true, 
  createdAt: true 
});
export type InsertInterviewQuestion = z.infer<typeof insertInterviewQuestionSchema>;
export type InterviewQuestion = typeof interviewQuestions.$inferSelect;

export const interviewSessions = pgTable("interview_sessions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  status: text("status").notNull().default("in_progress"),
  overallScore: integer("overall_score"),
  feedbackSummary: text("feedback_summary"),
  resumeText: text("resume_text"),
  difficulty: text("difficulty"),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const insertInterviewSessionSchema = createInsertSchema(interviewSessions).omit({ 
  id: true, 
  startedAt: true 
});
export type InsertInterviewSession = z.infer<typeof insertInterviewSessionSchema>;
export type InterviewSession = typeof interviewSessions.$inferSelect;

export const interviewResponses = pgTable("interview_responses", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: uuid("session_id").notNull().references(() => interviewSessions.id, { onDelete: "cascade" }),
  questionId: uuid("question_id").notNull().references(() => interviewQuestions.id, { onDelete: "cascade" }),
  transcript: text("transcript").notNull(),
  audioDurationSeconds: integer("audio_duration_seconds"),
  score: integer("score"),
  strengths: text("strengths").array(),
  improvements: text("improvements").array(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertInterviewResponseSchema = createInsertSchema(interviewResponses).omit({ 
  id: true, 
  createdAt: true 
});
export type InsertInterviewResponse = z.infer<typeof insertInterviewResponseSchema>;
export type InterviewResponse = typeof interviewResponses.$inferSelect;

// Interview turns for conversational flow
export const interviewTurns = pgTable("interview_turns", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: uuid("session_id").notNull().references(() => interviewSessions.id, { onDelete: "cascade" }),
  turnNumber: integer("turn_number").notNull(),
  agentMessage: text("agent_message"),
  userTranscript: text("user_transcript"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertInterviewTurnSchema = createInsertSchema(interviewTurns).omit({ 
  id: true, 
  createdAt: true 
});
export type InsertInterviewTurn = z.infer<typeof insertInterviewTurnSchema>;
export type InterviewTurn = typeof interviewTurns.$inferSelect;

// ElevenLabs voice interviews table
export const interviews = pgTable("interviews", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  conversationId: text("conversation_id"),
  agentId: text("agent_id").notNull(),
  transcript: text("transcript"),
  durationSeconds: integer("duration_seconds"),
  startedAt: timestamp("started_at"),
  endedAt: timestamp("ended_at"),
  status: text("status").notNull().default("completed"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertInterviewSchema = createInsertSchema(interviews).omit({ 
  id: true, 
  createdAt: true 
});
export type InsertInterview = z.infer<typeof insertInterviewSchema>;
export type Interview = typeof interviews.$inferSelect;
