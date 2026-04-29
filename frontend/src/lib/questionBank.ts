/**
 * Interview Question Bank
 *
 * Curated questions by academic year for the ElevenLabs agent.
 * Add {{question_bank}} to your ElevenLabs agent system prompt to inject these.
 * Questions are tailored by difficulty: Freshman/Sophomore get more behavioral,
 * Junior/Senior/PostGrad get more technical.
 */

export type YearKey = "high_school" | "freshman" | "sophomore" | "junior" | "senior" | "postgrad";

interface QuestionSet {
  behavioral: string[];
  technical: string[];
}

const QUESTION_BANK: Record<YearKey, QuestionSet> = {
  high_school: {
    behavioral: [
      "Can you tell me about yourself and your background?",
      "Tell me about a time when you worked with a team.",
      "How do you handle stress or deadlines?",
      "Why are you interested in this internship or program?",
      "What's a project or activity you're proud of?",
      "Describe a challenge you overcame.",
      "What do you like to do outside of school?",
    ],
    technical: [
      "What programming languages or tools have you tried?",
      "Tell me about a project you built.",
      "What would you like to learn in this role?",
    ],
  },
  freshman: {
    behavioral: [
      "Can you tell me about yourself and your background?",
      "Tell me about a time when you worked with a team.",
      "How do you handle stress or deadlines?",
      "Why are you interested in this internship?",
      "What's a project you're proud of?",
      "Describe a time you had to learn something new quickly.",
      "How do you stay organized with multiple assignments?",
    ],
    technical: [
      "What programming languages or frameworks have you used?",
      "Tell me about a coding project you've worked on.",
      "How would you explain [concept from resume] to someone new?",
      "What's a bug you had to debug and how did you fix it?",
    ],
  },
  sophomore: {
    behavioral: [
      "Can you tell me about yourself and your background?",
      "Tell me about a time when you worked with a team on a project.",
      "How do you handle conflicting priorities or deadlines?",
      "Why are you interested in this internship?",
      "Describe a time you received feedback and how you used it.",
      "Tell me about a time you had to persuade someone.",
    ],
    technical: [
      "What programming languages and tools have you used?",
      "Tell me about a project you built and what you learned.",
      "How would you explain REST APIs to someone new to coding?",
      "Describe a debugging challenge you faced.",
    ],
  },
  junior: {
    behavioral: [
      "Can you tell me about yourself and your background?",
      "Tell me about a time when you had to debug a difficult problem.",
      "Describe a project you're proud of and your role in it.",
      "How do you handle disagreements on technical decisions?",
      "Tell me about a time you had to learn a new technology quickly.",
      "Why are you interested in this role and company?",
    ],
    technical: [
      "How would you explain REST APIs to someone new to coding?",
      "Tell me about a project you're proud of.",
      "Describe a technical trade-off you had to make.",
      "How would you design a simple rate limiter?",
      "What's your approach to testing your code?",
    ],
  },
  senior: {
    behavioral: [
      "Can you tell me about yourself and your background?",
      "Tell me about a time when you had to make a technical trade-off.",
      "Describe a time you disagreed with a technical decision.",
      "Tell me about a project where you had to lead or take ownership.",
      "How do you stay current with new technologies?",
      "Why are you interested in this role?",
    ],
    technical: [
      "How would you design a rate limiter for an API?",
      "Tell me about a time you disagreed with a technical decision.",
      "How would you design a system for [X]?",
      "Describe your experience with distributed systems or scalability.",
      "What's your approach to code review and quality?",
    ],
  },
  postgrad: {
    behavioral: [
      "Can you tell me about yourself and your background?",
      "Tell me about a time when you led a technical initiative.",
      "Describe a complex technical problem you solved.",
      "How do you mentor or help junior developers?",
      "Why are you interested in this role?",
    ],
    technical: [
      "How would you design a distributed rate limiter?",
      "Describe your experience with system design at scale.",
      "How do you approach technical debt?",
      "Tell me about a time you had to make a critical technical decision.",
    ],
  },
};

function normalizeYear(year: string | undefined): YearKey {
  const y = (year || "").toLowerCase();
  if (y.includes("high school")) return "high_school";
  if (y.includes("freshman")) return "freshman";
  if (y.includes("sophomore")) return "sophomore";
  if (y.includes("junior")) return "junior";
  if (y.includes("senior")) return "senior";
  if (y.includes("post grad") || y.includes("postgrad") || y.includes("graduate")) return "postgrad";
  return "junior"; // default
}

/**
 * Get a formatted question bank string for the ElevenLabs agent.
 * Include in agent system prompt as: {{question_bank}}
 */
export function getQuestionBankForYear(year: string | undefined): string {
  const key = normalizeYear(year);
  const set = QUESTION_BANK[key];
  const all = [...set.behavioral, ...set.technical];
  return all.map((q) => `- ${q}`).join("\n");
}
