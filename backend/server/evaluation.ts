/**
 * Interview Evaluation System
 * 
 * Processes interview transcripts and generates per-question scores + overall evaluation.
 * Runs asynchronously via job queue to avoid blocking webhook responses.
 */

import { db } from "./db";
import { interviews, interviewEvaluations, insertInterviewEvaluationSchema } from "../shared/schema";
import { eq } from "drizzle-orm";
import { scoreInterview } from "./llm/openaiEvaluator";

// Evaluation job queue configuration
const MAX_CONCURRENT_JOBS = 2;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000; // 2 seconds base delay

interface EvaluationJob {
  interviewId: string;
  conversationId: string;
  retries: number;
}

class EvaluationQueue {
  private queue: EvaluationJob[] = [];
  private processing = false;
  private activeJobs = 0;

  async enqueue(interviewId: string, conversationId: string): Promise<void> {
    // Check if evaluation already exists or is pending
    const existing = await (db.query as any).interviewEvaluations?.findFirst({
      where: (evaluations: any, { eq }: any) => eq(evaluations.interviewId, interviewId),
    });

    if (existing) {
      if (existing.status === 'complete') {
        console.log(`[EVALUATION] Evaluation already complete for interview ${interviewId}`);
        return;
      }
      if (existing.status === 'pending') {
        console.log(`[EVALUATION] Evaluation already pending for interview ${interviewId}`);
        return;
      }
    }

    // Create pending evaluation record
    try {
      const evaluationData = insertInterviewEvaluationSchema.parse({
        interviewId,
        status: 'pending',
      });
      await db.insert(interviewEvaluations).values(evaluationData as any);
      console.log(`[EVALUATION] Created pending evaluation for interview ${interviewId}`);
    } catch (error: any) {
      // If it already exists, that's fine - continue
      if (!error.message?.includes('duplicate') && !error.message?.includes('unique')) {
        console.error(`[EVALUATION] Error creating evaluation record:`, error);
        throw error;
      }
    }

    // Add to queue
    this.queue.push({ interviewId, conversationId, retries: 0 });
    console.log(`[EVALUATION] Enqueued evaluation job for interview ${interviewId} (queue size: ${this.queue.length})`);

    // Start processing if not already running
    if (!this.processing) {
      this.processQueue();
    }
  }

  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0 || this.activeJobs > 0) {
      // Start new jobs up to concurrency limit
      while (this.activeJobs < MAX_CONCURRENT_JOBS && this.queue.length > 0) {
        const job = this.queue.shift();
        if (job) {
          this.activeJobs++;
          this.processJob(job).finally(() => {
            this.activeJobs--;
          });
        }
      }

      // Wait a bit before checking again
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.processing = false;
  }

  private async processJob(job: EvaluationJob): Promise<void> {
    const { interviewId, conversationId, retries } = job;

    try {
      console.log(`[EVALUATION] Starting evaluation for interview ${interviewId} (attempt ${retries + 1})`);

      // Update status to processing (implicitly via evaluateInterview)
      await evaluateInterview(interviewId);

      console.log(`[EVALUATION] Completed evaluation for interview ${interviewId}`);
    } catch (error: any) {
      console.error(`[EVALUATION] Error evaluating interview ${interviewId}:`, error);

      if (retries < MAX_RETRIES) {
        const delay = RETRY_DELAY_MS * Math.pow(2, retries); // Exponential backoff
        console.log(`[EVALUATION] Retrying evaluation for interview ${interviewId} after ${delay}ms`);
        
        // Update error status
        await db.update(interviewEvaluations)
          .set({
            status: 'failed',
            error: `Attempt ${retries + 1} failed: ${error.message}`,
            updatedAt: new Date(),
          })
          .where(eq(interviewEvaluations.interviewId, interviewId));

        // Re-enqueue with incremented retries
        setTimeout(() => {
          this.queue.push({ ...job, retries: retries + 1 });
          if (!this.processing) {
            this.processQueue();
          }
        }, delay);
      } else {
        // Max retries exceeded - mark as failed
        console.error(`[EVALUATION] Max retries exceeded for interview ${interviewId}`);
        await db.update(interviewEvaluations)
          .set({
            status: 'failed',
            error: `Failed after ${MAX_RETRIES} retries: ${error.message}`,
            updatedAt: new Date(),
          })
          .where(eq(interviewEvaluations.interviewId, interviewId));
      }
    }
  }
}

// Singleton queue instance
export const evaluationQueue = new EvaluationQueue();

/**
 * Evaluate an interview transcript and generate scores
 */
export async function evaluateInterview(interviewId: string): Promise<void> {
  // Load interview from database
  const interview = await (db.query as any).interviews?.findFirst({
    where: (interviews: any, { eq }: any) => eq(interviews.id, interviewId),
  });

  if (!interview) {
    throw new Error(`Interview ${interviewId} not found`);
  }

  if (!interview.transcript) {
    throw new Error(`Interview ${interviewId} has no transcript`);
  }

  // Parse transcript into question-answer pairs
  const qaPairs = parseTranscript(interview.transcript);

  if (qaPairs.length === 0) {
    throw new Error(`No question-answer pairs found in transcript`);
  }

  // Generate evaluation using OpenAI
  // Note: role and major are not stored in interviews table, so we pass undefined
  // The evaluator can work without them
  const evaluation = await scoreInterview({
    role: undefined, // Could be extracted from dynamic variables if stored
    major: undefined, // Could be extracted from dynamic variables if stored
    questions: qaPairs,
  });

  // Save evaluation to database
  await db.update(interviewEvaluations)
    .set({
      status: 'complete',
      overallScore: evaluation.overall_score,
      evaluationJson: evaluation,
      updatedAt: new Date(),
    })
    .where(eq(interviewEvaluations.interviewId, interviewId));

  console.log(`[EVALUATION] Saved evaluation for interview ${interviewId} (score: ${evaluation.overall_score})`);
}

/**
 * Parse transcript into question-answer pairs
 * Handles various transcript formats:
 * - Speaker labels (AI:, User:, Interviewer:, Candidate:)
 * - Plain text with line breaks
 */
function parseTranscript(transcript: string): Array<{ question: string; answer: string }> {
  const pairs: Array<{ question: string; answer: string }> = [];
  
  // Try to detect speaker labels
  const speakerPattern = /^(AI|User|Interviewer|Candidate|Agent):\s*(.+)$/im;
  const lines = transcript.split(/\n+/).filter(line => line.trim());
  
  let currentQuestion = '';
  let currentAnswer = '';
  let lastSpeaker = '';
  
  for (const line of lines) {
    const match = line.match(speakerPattern);
    
    if (match) {
      const [, speaker, text] = match;
      const normalizedSpeaker = speaker.toLowerCase();
      
      // If we have a question and answer, save the pair
      if (currentQuestion && currentAnswer && lastSpeaker === 'user') {
        pairs.push({
          question: currentQuestion.trim(),
          answer: currentAnswer.trim(),
        });
        currentQuestion = '';
        currentAnswer = '';
      }
      
      // Update current speaker and accumulate text
      if (normalizedSpeaker === 'ai' || normalizedSpeaker === 'interviewer' || normalizedSpeaker === 'agent') {
        if (currentQuestion) {
          currentQuestion += ' ' + text;
        } else {
          currentQuestion = text;
        }
        lastSpeaker = 'ai';
      } else if (normalizedSpeaker === 'user' || normalizedSpeaker === 'candidate') {
        if (currentAnswer) {
          currentAnswer += ' ' + text;
        } else {
          currentAnswer = text;
        }
        lastSpeaker = 'user';
      }
    } else {
      // No speaker label - accumulate based on last speaker
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      if (lastSpeaker === 'ai' || !lastSpeaker) {
        if (currentQuestion) {
          currentQuestion += ' ' + trimmed;
        } else {
          currentQuestion = trimmed;
        }
        lastSpeaker = 'ai';
      } else if (lastSpeaker === 'user') {
        if (currentAnswer) {
          currentAnswer += ' ' + trimmed;
        } else {
          currentAnswer = trimmed;
        }
      }
    }
  }
  
  // Save last pair if exists
  if (currentQuestion && currentAnswer) {
    pairs.push({
      question: currentQuestion.trim(),
      answer: currentAnswer.trim(),
    });
  }
  
  // Fallback: if no pairs found, try splitting by question marks
  if (pairs.length === 0) {
    const sentences = transcript.split(/[.!?]+/).filter(s => s.trim().length > 10);
    for (let i = 0; i < sentences.length - 1; i += 2) {
      const question = sentences[i].trim();
      const answer = sentences[i + 1].trim();
      if (question.length > 10 && answer.length > 10) {
        pairs.push({ question, answer });
      }
    }
  }
  
  return pairs;
}


