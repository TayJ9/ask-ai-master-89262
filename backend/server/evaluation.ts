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
  private healthCheckInterval: NodeJS.Timeout | null = null;
  
  // Stalled evaluation threshold: 5 minutes
  private readonly STALLED_THRESHOLD_MS = 5 * 60 * 1000;

  constructor() {
    // Start health check on initialization
    this.startHealthCheck();
  }

  /**
   * Health check: Find and retry stalled evaluations
   */
  private async checkStalledEvaluations(): Promise<void> {
    try {
      const cutoffTime = new Date(Date.now() - this.STALLED_THRESHOLD_MS);
      
      // Find evaluations that have been pending for too long
      const stalledEvaluations = await (db.query as any).interviewEvaluations?.findMany({
        where: (evaluations: any, { eq, and, lt }: any) => and(
          eq(evaluations.status, 'pending'),
          lt(evaluations.createdAt, cutoffTime)
        ),
      }) || [];

      if (stalledEvaluations.length > 0) {
        console.log(`[EVALUATION] Health check found ${stalledEvaluations.length} stalled evaluation(s)`);
        
        for (const evaluationRecord of stalledEvaluations) {
          // Check if interview still exists and has transcript
          const interview = await (db.query as any).interviews?.findFirst({
            where: (interviews: any, { eq }: any) => eq(interviews.id, evaluationRecord.interviewId),
          });
          
          if (interview && interview.transcript) {
            console.log(`[EVALUATION] Retrying stalled evaluation for interview ${evaluationRecord.interviewId}`);
            // Re-enqueue the stalled evaluation
            await this.enqueue(evaluationRecord.interviewId, interview.conversationId || '');
          } else {
            // Interview doesn't exist or has no transcript - mark as failed
            console.log(`[EVALUATION] Marking stalled evaluation as failed (no transcript): ${evaluationRecord.interviewId}`);
            await db.update(interviewEvaluations)
              .set({
                status: 'failed',
                error: 'Evaluation stalled - interview missing or no transcript available',
                updatedAt: new Date(),
              })
              .where(eq(interviewEvaluations.interviewId, evaluationRecord.interviewId));
          }
        }
      }
    } catch (error: any) {
      console.error('[EVALUATION] Error in health check:', error);
    }
  }

  /**
   * Start periodic health check (runs every 2 minutes)
   */
  private startHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    // Run health check every 2 minutes
    this.healthCheckInterval = setInterval(() => {
      this.checkStalledEvaluations();
    }, 2 * 60 * 1000);
    
    // Run initial health check after 1 minute
    setTimeout(() => {
      this.checkStalledEvaluations();
    }, 60 * 1000);
  }

  /**
   * Stop health check (for cleanup)
   */
  public stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  async enqueue(interviewId: string, conversationId: string): Promise<void> {
    console.log(`[EVALUATION] 🔄 Enqueue request received`, {
      interviewId,
      conversationId,
      timestamp: new Date().toISOString(),
    });

    // Check if evaluation already exists or is pending
    const existing = await (db.query as any).interviewEvaluations?.findFirst({
      where: (evaluations: any, { eq }: any) => eq(evaluations.interviewId, interviewId),
    });

    if (existing) {
      console.log(`[EVALUATION] Existing evaluation found`, {
        interviewId,
        status: existing.status,
        createdAt: existing.createdAt,
        updatedAt: existing.updatedAt,
      });

      if (existing.status === 'complete') {
        console.log(`[EVALUATION] ✅ Evaluation already complete for interview ${interviewId} - skipping`);
        return;
      }
      if (existing.status === 'pending') {
        // Check if it's stalled (pending for too long)
        const createdAt = new Date(existing.createdAt);
        const ageMs = Date.now() - createdAt.getTime();
        
        if (ageMs > this.STALLED_THRESHOLD_MS) {
          console.log(`[EVALUATION] ⚠️ Found stalled pending evaluation for interview ${interviewId} (age: ${Math.round(ageMs / 1000)}s) - retrying`);
          // Don't return - continue to re-enqueue
        } else {
          console.log(`[EVALUATION] ⏳ Evaluation already pending for interview ${interviewId} (age: ${Math.round(ageMs / 1000)}s) - skipping duplicate`);
          return;
        }
      }
    } else {
      console.log(`[EVALUATION] No existing evaluation found - creating new one`);
    }

    // Create pending evaluation record
    try {
      const evaluationData = insertInterviewEvaluationSchema.parse({
        interviewId,
        status: 'pending',
      });
      await db.insert(interviewEvaluations).values(evaluationData as any);
      console.log(`[EVALUATION] ✅ Created pending evaluation record for interview ${interviewId}`);
    } catch (error: any) {
      // If it already exists, that's fine - continue
      const errorMessage = error?.message || String(error);
      if (!errorMessage.includes('duplicate') && !errorMessage.includes('unique')) {
        console.error(`[EVALUATION] ❌ Error creating evaluation record:`, {
          error: errorMessage,
          interviewId,
        });
        throw error;
      } else {
        console.log(`[EVALUATION] Evaluation record already exists (race condition) - continuing`);
      }
    }

    // Add to queue
    this.queue.push({ interviewId, conversationId, retries: 0 });
    console.log(`[EVALUATION] 📥 Enqueued evaluation job`, {
      interviewId,
      conversationId,
      queueSize: this.queue.length,
      activeJobs: this.activeJobs,
      maxConcurrent: MAX_CONCURRENT_JOBS,
    });

    // Start processing if not already running
    if (!this.processing) {
      console.log(`[EVALUATION] 🚀 Starting queue processor`);
      this.processQueue();
    } else {
      console.log(`[EVALUATION] Queue processor already running`);
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
      console.log(`[EVALUATION] 🎯 Starting evaluation job`, {
        interviewId,
        conversationId,
        attempt: retries + 1,
        maxRetries: MAX_RETRIES,
        timestamp: new Date().toISOString(),
      });

      // Update status to processing (implicitly via evaluateInterview)
      await evaluateInterview(interviewId);

      console.log(`[EVALUATION] ✅ Successfully completed evaluation for interview ${interviewId}`, {
        interviewId,
        conversationId,
        timestamp: new Date().toISOString(),
      });
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
  console.log(`[EVALUATION] 📊 Starting evaluation process for interview ${interviewId}`);

  // Load interview from database
  const interview = await (db.query as any).interviews?.findFirst({
    where: (interviews: any, { eq }: any) => eq(interviews.id, interviewId),
  });

  if (!interview) {
    console.error(`[EVALUATION] ❌ Interview ${interviewId} not found in database`);
    throw new Error(`Interview ${interviewId} not found`);
  }

  console.log(`[EVALUATION] ✅ Interview found`, {
    interviewId,
    hasTranscript: !!interview.transcript,
    transcriptLength: interview.transcript?.length || 0,
    status: interview.status,
  });

  if (!interview.transcript) {
    console.error(`[EVALUATION] ❌ Interview ${interviewId} has no transcript`);
    throw new Error(`Interview ${interviewId} has no transcript`);
  }

  // Parse transcript into question-answer pairs
  console.log(`[EVALUATION] 📝 Parsing transcript into Q&A pairs...`);
  const qaPairs = parseTranscript(interview.transcript);

  console.log(`[EVALUATION] ✅ Parsed transcript`, {
    interviewId,
    qaPairsCount: qaPairs.length,
    qaPairsPreview: qaPairs.slice(0, 2).map(qa => ({
      question: qa.question.substring(0, 50) + '...',
      answerLength: qa.answer.length,
    })),
  });

  if (qaPairs.length === 0) {
    console.error(`[EVALUATION] ❌ No question-answer pairs found in transcript`, {
      interviewId,
      transcriptLength: interview.transcript.length,
      transcriptPreview: interview.transcript.substring(0, 200),
    });
    throw new Error(`No question-answer pairs found in transcript`);
  }

  // Extract role/major from session's candidateContext and resume from resumes table
  let role: string | undefined;
  let major: string | undefined;
  let resumeText: string | undefined;

  try {
    // Find session linked to this interview
    const session = await (db.query as any).elevenLabsInterviewSessions?.findFirst({
      where: (sessions: any, { eq }: any) => eq(sessions.interviewId, interviewId),
    });

    if (session?.candidateContext) {
      const context = session.candidateContext as any;
      role = context.role || context.target_role;
      major = context.major;
      console.log(`[EVALUATION] ✅ Extracted context from session`, {
        role,
        major,
        hasContext: !!session.candidateContext,
      });
    }

    // Get resume text and profile from resumes table
    const resume = await (db.query as any).resumes?.findFirst({
      where: (resumes: any, { eq }: any) => eq(resumes.interviewId, interviewId),
    });

    if (resume) {
      if (resume.resumeFulltext) {
        resumeText = resume.resumeFulltext;
        console.log(`[EVALUATION] ✅ Found resume text`, {
          resumeLength: resumeText.length,
        });
      }

      // Try to extract role/major from resumeProfile if not found in session
      if (resume.resumeProfile && (!role || !major)) {
        const profile = resume.resumeProfile as any;
        if (!role && profile.major) {
          // Infer role from major
          const majorLower = (profile.major || '').toLowerCase();
          if (majorLower.includes('computer science') || majorLower.includes('cs ') || majorLower.includes('software')) {
            role = 'Software Engineer';
          } else if (majorLower.includes('finance') || majorLower.includes('accounting')) {
            role = 'Financial Analyst';
          } else if (majorLower.includes('engineering')) {
            role = 'Engineer';
          } else if (majorLower.includes('business') || majorLower.includes('management')) {
            role = 'Business Analyst';
          }
        }
        if (!major && profile.major) {
          major = profile.major;
        }
        if (role || major) {
          console.log(`[EVALUATION] ✅ Extracted role/major from resumeProfile`, {
            role,
            major,
          });
        }
      }
    }
  } catch (contextError: any) {
    console.warn(`[EVALUATION] ⚠️ Could not extract context/resume (non-critical):`, contextError.message);
    // Continue without context - evaluation can still work
  }

  // Update status to 'processing' before starting evaluation
  try {
    await db.update(interviewEvaluations)
      .set({
        status: 'processing',
        updatedAt: new Date(),
      })
      .where(eq(interviewEvaluations.interviewId, interviewId));
    console.log(`[EVALUATION] 📊 Updated status to 'processing' for interview ${interviewId}`);
  } catch (statusError: any) {
    console.warn(`[EVALUATION] ⚠️ Could not update status to 'processing' (non-critical):`, statusError.message);
  }

  // Generate evaluation using OpenAI
  console.log(`[EVALUATION] 🤖 Generating evaluation using OpenAI...`, {
    interviewId,
    qaPairsCount: qaPairs.length,
    hasRole: !!role,
    hasMajor: !!major,
    hasResume: !!resumeText,
  });

  const evaluation = await scoreInterview({
    role,
    major,
    resumeText,
    questions: qaPairs,
  });

  console.log(`[EVALUATION] ✅ Evaluation generated`, {
    interviewId,
    overallScore: evaluation.overall_score,
    questionsEvaluated: evaluation.questions?.length || 0,
  });

  // Save evaluation to database
  console.log(`[EVALUATION] 💾 Saving evaluation to database...`);
  await db.update(interviewEvaluations)
    .set({
      status: 'complete',
      overallScore: evaluation.overall_score,
      evaluationJson: evaluation,
      updatedAt: new Date(),
    })
    .where(eq(interviewEvaluations.interviewId, interviewId));

  console.log(`[EVALUATION] ✅ Saved evaluation for interview ${interviewId}`, {
    interviewId,
    overallScore: evaluation.overall_score,
    status: 'complete',
    timestamp: new Date().toISOString(),
  });
}

/**
 * Parse transcript into question-answer pairs
 * Handles various transcript formats:
 * - Speaker labels (AI:, User:, Interviewer:, Candidate:)
 * - Plain text with line breaks
 * - Multiple fallback strategies for edge cases
 */
export function parseTranscript(transcript: string): Array<{ question: string; answer: string }> {
  const pairs: Array<{ question: string; answer: string }> = [];
  
  if (!transcript || transcript.trim().length === 0) {
    console.log('[PARSE_TRANSCRIPT] Empty transcript provided');
    return pairs;
  }
  
  const transcriptLength = transcript.length;
  const hasNewlines = transcript.includes('\n');
  const hasSpeakerLabels = /^(AI|User|Interviewer|Candidate|Agent):/im.test(transcript);
  
  console.log('[PARSE_TRANSCRIPT] Format detection:', {
    length: transcriptLength,
    hasNewlines,
    hasSpeakerLabels,
    preview: transcript.substring(0, 200),
  });
  
  // Strategy 1: Try to detect speaker labels
  const speakerPattern = /^(AI|User|Interviewer|Candidate|Agent):\s*(.+)$/im;
  const lines = transcript.split(/\n+/).filter(line => line.trim());
  
  let currentQuestion = '';
  let currentAnswer = '';
  let lastSpeaker = '';
  let speakerLabelCount = 0;
  
  for (const line of lines) {
    const match = line.match(speakerPattern);
    
    if (match) {
      speakerLabelCount++;
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
  
  console.log('[PARSE_TRANSCRIPT] Strategy 1 (speaker labels) result:', {
    pairsFound: pairs.length,
    speakerLabelCount,
    lastSpeaker,
  });
  
  // Strategy 2: If no pairs found with speaker labels, try alternating paragraphs
  if (pairs.length === 0 && hasNewlines) {
    const paragraphs = transcript.split(/\n\s*\n+/).filter(p => p.trim().length > 10);
    console.log('[PARSE_TRANSCRIPT] Strategy 2 (alternating paragraphs):', {
      paragraphCount: paragraphs.length,
    });
    
    // Assume alternating Q&A pattern
    for (let i = 0; i < paragraphs.length - 1; i += 2) {
      const question = paragraphs[i].trim();
      const answer = paragraphs[i + 1].trim();
      
      // Heuristic: questions often end with '?' or contain question words
      const looksLikeQuestion = question.includes('?') || 
        /\b(what|how|why|when|where|who|can|could|would|should|tell|describe|explain)\b/i.test(question);
      
      if (question.length > 10 && answer.length > 10) {
        // If it looks like a question, use as-is; otherwise try to infer
        if (looksLikeQuestion || i === 0) {
          pairs.push({ question, answer });
        }
      }
    }
    
    console.log('[PARSE_TRANSCRIPT] Strategy 2 result:', { pairsFound: pairs.length });
  }
  
  // Strategy 3: Fallback - split by sentence endings
  if (pairs.length === 0) {
    console.log('[PARSE_TRANSCRIPT] Strategy 3 (sentence splitting)');
    const sentences = transcript.split(/[.!?]+/).filter(s => s.trim().length > 10);
    
    // Try pairing sentences - assume odd-indexed are questions, even-indexed are answers
    // But only if we have question marks or question words
    const hasQuestionMarks = transcript.includes('?');
    
    if (hasQuestionMarks && sentences.length >= 2) {
      for (let i = 0; i < sentences.length - 1; i += 2) {
        const question = sentences[i].trim();
        const answer = sentences[i + 1].trim();
        if (question.length > 10 && answer.length > 10 && question.includes('?')) {
          pairs.push({ question, answer });
        }
      }
    } else if (sentences.length >= 2) {
      // No question marks - try pairing anyway but be more conservative
      for (let i = 0; i < sentences.length - 1 && i < 10; i += 2) {
        const question = sentences[i].trim();
        const answer = sentences[i + 1].trim();
        if (question.length > 15 && answer.length > 15) {
          pairs.push({ question, answer });
        }
      }
    }
    
    console.log('[PARSE_TRANSCRIPT] Strategy 3 result:', { pairsFound: pairs.length });
  }
  
  // Final validation: filter out pairs that are too short or invalid
  const validPairs = pairs.filter(pair => {
    const qValid = pair.question.trim().length >= 10;
    const aValid = pair.answer.trim().length >= 10;
    return qValid && aValid;
  });
  
  console.log('[PARSE_TRANSCRIPT] Final result:', {
    totalPairs: pairs.length,
    validPairs: validPairs.length,
    filteredOut: pairs.length - validPairs.length,
  });
  
  return validPairs;
}


