/**
 * Demo resume profiles for the portfolio "resume-aware questions" preview.
 * Each profile includes pre-written questions that reference specific resume details.
 */

export type DemoResumeId = "tech" | "business" | "healthcare";

export interface DemoResumeProfile {
  id: DemoResumeId;
  name: string;
  major: string;
  year: string;
  tagline: string;
  highlights: [string, string, string];
  resumeSummary: string;
  questions: [string, string, string, string, string, string, string, string, string, string];
}

export const demoResumes: DemoResumeProfile[] = [
  {
    id: "tech",
    name: "Alexandra Chen",
    major: "Computer Science",
    year: "Senior",
    tagline: "Full-stack developer with internship experience and open-source contributions",
    highlights: [
      "Software Development Intern at TechCorp — optimized API response time by 35%",
      "Built e-commerce platform with React, Node.js, Stripe, and AWS deployment",
      "Teaching Assistant for 120+ students; CS Club Vice President",
    ],
    resumeSummary:
      "Alexandra Chen is a CS senior at State University (GPA 3.8, graduating May 2025) with strong full-stack skills in React, TypeScript, Node.js, and PostgreSQL. She interned at TechCorp Solutions, where she built REST APIs, improved query performance by 35%, and achieved 85% test coverage. Her personal e-commerce project integrates JWT auth, Stripe payments, and Docker on AWS. She also serves as a TA for Intro to Programming and leads the CS Club as Vice President.",
    questions: [
      "I noticed you optimized database queries at TechCorp and reduced API response time by 35%. Can you walk me through your approach and what trade-offs you considered?",
      "Your e-commerce platform uses JWT authentication and Stripe payments. How did you design the security model, and what would you do differently today?",
      "You mentioned achieving 85% code coverage during your internship. How did you decide what to test, and how did testing fit into your team's sprint workflow?",
      "As a Teaching Assistant for 120+ students, tell me about a time you helped someone who was really struggling to grasp a programming concept.",
      "Your hackathon team won Best User Experience for a campus navigation app. What was your role, and how did you prioritize features under time pressure?",
      "You contributed to open-source React libraries. Can you describe a specific contribution and how you navigated an unfamiliar codebase?",
      "The academic database project used role-based access control. How did you model permissions, and what edge cases did you have to handle?",
      "You deployed your e-commerce app on AWS EC2 with Docker and a CI/CD pipeline. Walk me through your deployment process and how you'd improve it for production scale.",
      "As CS Club Vice President, you organize workshops and hackathons. Tell me about a time something didn't go as planned and how you recovered.",
      "You're graduating in May 2025 with experience in Agile teams. How do you handle conflicting priorities when you're mid-sprint and a production bug appears?",
    ],
  },
  {
    id: "business",
    name: "Marcus Williams",
    major: "Business Administration",
    year: "Senior",
    tagline: "Marketing-focused student with internship and campus ambassador experience",
    highlights: [
      "Marketing Intern at RetailPlus — campaign planning and engagement analytics",
      "Led student organization social media campaign in sophomore year",
      "Campus ambassador for a local startup, growing on-campus brand presence",
    ],
    resumeSummary:
      "Marcus Williams is a senior Business Administration major at State University, graduating May 2025, with a focus on digital marketing and brand strategy. He completed a marketing internship at RetailPlus where he supported campaign planning and analyzed customer engagement using Google Analytics and social insights. He led his student organization's social media campaign and served as a campus ambassador for a local startup. Marcus is skilled in metrics-driven marketing, including engagement rate, conversion, ROI, and A/B testing.",
    questions: [
      "You led a social media campaign for a student organization in your sophomore year. What was your strategy, and how did you measure whether it worked?",
      "During your RetailPlus internship, you analyzed customer engagement data. Which metrics mattered most, and can you share an insight that changed how the team approached a campaign?",
      "Tell me about a time at RetailPlus when you had to work with a teammate who was missing deadlines. How did you handle it without derailing the campaign launch?",
      "As a campus ambassador for a startup, how did you grow their on-campus presence? What tactics worked best with your student audience?",
      "How would you measure the success of a marketing campaign for a new product launch? Walk me through the KPIs you'd track from awareness to conversion.",
      "Describe a situation where you had to present campaign results to stakeholders with very little notice. How did you prepare and what did you prioritize?",
      "You mentioned using A/B testing during your internship. Can you give an example of a test you ran and what you learned from the results?",
      "When you had overlapping deadlines during finals and your internship, how did you prioritize and communicate with your manager?",
      "What drew you to marketing and brand strategy specifically, rather than other business paths like finance or operations?",
      "You're interested in data-driven decision making. How would you balance creativity in campaign messaging with what the analytics tell you?",
    ],
  },
  {
    id: "healthcare",
    name: "Priya Patel",
    major: "Nursing (BSN)",
    year: "Junior",
    tagline: "Clinical nursing student with hospital volunteer and community health experience",
    highlights: [
      "Clinical rotations at Riverside Medical Center — med-surg and pediatric units",
      "Volunteer at Community Free Clinic — patient intake and health education",
      "Certified in BLS and ACLS; Dean's List with 3.7 GPA",
    ],
    resumeSummary:
      "Priya Patel is a BSN junior at State University (GPA 3.7, Dean's List) with clinical rotations at Riverside Medical Center in med-surg and pediatric units. She volunteers at the Community Free Clinic, assisting with patient intake and delivering health education to underserved populations. Priya holds BLS and ACLS certifications and has completed coursework in pharmacology, pathophysiology, and health assessment. She is passionate about patient-centered care and reducing health disparities in her community.",
    questions: [
      "During your med-surg rotation at Riverside Medical Center, tell me about a patient interaction that challenged your communication skills. How did you handle it?",
      "You volunteer at the Community Free Clinic doing patient intake. What have you learned about building trust with patients who may feel hesitant about healthcare?",
      "Describe a time in your pediatric rotation when you had to adapt your approach for a child who was anxious or uncooperative.",
      "Patient safety is critical in nursing. Can you share an example from clinicals where you identified a potential safety issue and spoke up?",
      "You're certified in BLS and ACLS. Walk me through how you'd respond if you found an unresponsive patient on the unit.",
      "Your resume mentions health education for underserved populations. How do you make complex medical information accessible to patients with varying literacy levels?",
      "Nursing requires collaboration with physicians, CNAs, and other staff. Tell me about a time when miscommunication affected patient care and how you resolved it.",
      "Balancing clinical hours, coursework, and volunteering is demanding. How do you manage stress and prevent burnout while maintaining quality care?",
      "What motivated you to pursue nursing specifically, and how has that motivation shown up during a difficult clinical day?",
      "You're interested in reducing health disparities. Based on your clinic volunteer work, what barriers have you seen, and how would you address them as a new graduate nurse?",
    ],
  },
];

const resumeById = new Map(demoResumes.map((r) => [r.id, r]));

export function getDemoResume(id: DemoResumeId): DemoResumeProfile | undefined {
  return resumeById.get(id);
}

/** Public URL for pre-generated ElevenLabs TTS (see scripts/generate-demo-question-audio.ts). */
export function getQuestionAudioSrc(resumeId: DemoResumeId, index: number): string {
  return `/demo/audio/${resumeId}-${index}.mp3`;
}

/** Pick a random unused question index; reshuffles when all have been used. */
export function getNextQuestion(
  resumeId: DemoResumeId,
  usedSet: Set<number>,
): { index: number; question: string; audioSrc: string } | null {
  const profile = resumeById.get(resumeId);
  if (!profile) return null;

  const total = profile.questions.length;
  let available = profile.questions
    .map((question, index) => ({ index, question }))
    .filter(({ index }) => !usedSet.has(index));

  if (available.length === 0) {
    usedSet.clear();
    available = profile.questions.map((question, index) => ({ index, question }));
  }

  const pick = available[Math.floor(Math.random() * available.length)];
  return {
    index: pick.index,
    question: pick.question,
    audioSrc: getQuestionAudioSrc(resumeId, pick.index),
  };
}
