/** Bump when terms change so users must re-accept. */
export const TERMS_VERSION = "2026-07-10";

export const TERMS_LAST_UPDATED = "July 10, 2026";

export const TERMS_CONTACT_EMAIL = "support@mockly.app";

export type TermsSection = {
  id: string;
  title: string;
  paragraphs: string[];
  bullets?: string[];
};

export const TERMS_SECTIONS: TermsSection[] = [
  {
    id: "introduction",
    title: "1. Introduction",
    paragraphs: [
      'Welcome to Mockly ("Mockly," "we," "us," or "our"). Mockly provides AI-powered mock voice interview sessions, transcript review, and coaching-style feedback for students and early-career candidates.',
      "By creating an account or using Mockly, you agree to these Terms and Conditions and our data practices described below. If you do not agree, do not use the service.",
    ],
  },
  {
    id: "eligibility",
    title: "2. Eligibility & Your Account",
    paragraphs: [
      "You must be at least 13 years old (or the minimum age required in your jurisdiction) to use Mockly. If you are under 18, you represent that you have permission from a parent or legal guardian.",
      "When you register, you provide your full name, email address, and a password. You are responsible for keeping your credentials secure and for all activity under your account.",
    ],
  },
  {
    id: "data-we-collect",
    title: "3. Information We Collect",
    paragraphs: [
      "To provide mock interviews and personalized feedback, Mockly collects and processes the following information:",
    ],
    bullets: [
      "Account information: your name, email address, and authentication credentials (passwords are stored in hashed form only).",
      "Profile and resume information: first name, academic major or focus area, academic level, and resume content you upload (PDF or pasted text), including skills, education, projects, and work experience.",
      "Interview data: text transcripts of your mock interview sessions (questions, your spoken answers as transcribed, and AI interviewer responses), session duration, timestamps, and related metadata.",
      "Results and coaching outputs: scores, strengths, improvement suggestions, STAR-style analysis, and other AI-generated feedback derived from your transcripts.",
      "Technical data: session tokens stored in your browser, basic usage logs on our servers, and information needed to operate and secure the platform.",
    ],
  },
  {
    id: "how-we-use-data",
    title: "4. How We Use Your Information",
    paragraphs: [
      "We use your information solely to operate and improve Mockly, including to:",
    ],
    bullets: [
      "Create and manage your account and authenticate you.",
      "Tailor mock interview questions to your resume, major, and experience level.",
      "Conduct voice interview sessions and generate transcripts.",
      "Produce scores and coaching feedback for your review.",
      "Save your progress so you can return to past sessions and results.",
      "Maintain security, prevent abuse, and troubleshoot technical issues.",
    ],
  },
  {
    id: "ai-and-third-parties",
    title: "5. AI Processing & Third-Party Services",
    paragraphs: [
      "Mockly relies on third-party AI and voice providers to deliver core features. By using the service, you acknowledge that:",
    ],
    bullets: [
      "Voice interviews are powered by ElevenLabs. Your microphone audio is processed in real time to enable the conversation. Mockly does not store raw audio recordings in its database; we store text transcripts and session metadata.",
      "Interview evaluation and coaching feedback are generated using OpenAI models. We send transcript content and limited resume excerpts (sanitized where possible) to generate scores and feedback.",
      "Optional services such as Hugging Face may be used to parse resumes or transcripts. When enabled, resume or transcript text may be sent to those providers for processing.",
      "These providers process data under their own terms and privacy policies. You should not share sensitive information you do not want processed by AI systems—including Social Security numbers, health information, passwords, or confidential employer data.",
    ],
  },
  {
    id: "resume-privacy",
    title: "6. Resume & Personal Information",
    paragraphs: [
      "Resumes often contain personal and professional details about you and sometimes others (e.g., references). You represent that you have the right to upload your resume and that the content is accurate to the best of your knowledge.",
      "Mockly attempts to remove obvious contact details (such as email addresses and phone numbers) from resume text before certain AI processing steps, but removal is not guaranteed. Please review what you upload and avoid including information you are not comfortable sharing.",
      "Your full name, first name, major, and resume-derived profile may be used to personalize interview questions and feedback shown to you.",
    ],
  },
  {
    id: "storage-retention",
    title: "7. Storage, Retention & Deletion",
    paragraphs: [
      "Your data is stored in secure databases associated with your account. Interview transcripts, resume content, and evaluation results remain available to you while your account is active unless deleted as part of account removal.",
      "We may retain data as needed to comply with law, resolve disputes, and enforce these terms. If you wish to delete your account and associated data, contact us at the email below. Upon verified deletion, we will remove your profile and related interview, resume, and evaluation records from our systems, subject to legal retention requirements.",
    ],
  },
  {
    id: "your-responsibilities",
    title: "8. Acceptable Use",
    paragraphs: ["You agree not to:"],
    bullets: [
      "Upload another person's resume or personal information without their permission.",
      "Use Mockly to harass, impersonate others, or submit unlawful, harmful, or misleading content.",
      "Attempt to bypass security, scrape the service, or interfere with its operation.",
      "Upload malware or files other than permitted resume formats.",
      "Rely on Mockly outputs as official hiring decisions, legal advice, or guaranteed interview outcomes.",
    ],
  },
  {
    id: "disclaimers",
    title: "9. AI Disclaimers",
    paragraphs: [
      "Mockly provides practice tools only. AI-generated scores, feedback, and sample answers are estimates based on automated analysis. They may be incomplete, inaccurate, or inappropriate for your specific situation.",
      "Mockly is not a substitute for professional career counseling, human interview coaching, or employer evaluation. You are solely responsible for how you use feedback from the platform.",
    ],
  },
  {
    id: "intellectual-property",
    title: "10. Intellectual Property",
    paragraphs: [
      "You retain ownership of content you submit (such as your resume and interview responses). You grant Mockly a limited license to store, process, and display that content solely to provide the service to you.",
      "Mockly's software, branding, and AI-generated presentation of your results remain our property or that of our licensors. You may not copy, resell, or commercially exploit the platform without permission.",
    ],
  },
  {
    id: "limitation",
    title: "11. Limitation of Liability",
    paragraphs: [
      'Mockly is provided "as is" and "as available" without warranties of any kind, express or implied. To the fullest extent permitted by law, Mockly and its operators are not liable for indirect, incidental, special, or consequential damages arising from your use of the service, including reliance on AI feedback or lost opportunities.',
      "Our total liability for any claim related to the service is limited to the amount you paid us in the twelve months before the claim, or zero if you use a free tier.",
    ],
  },
  {
    id: "changes",
    title: "12. Changes to These Terms",
    paragraphs: [
      "We may update these Terms from time to time. When we do, we will revise the 'Last updated' date and may require you to review and accept the updated terms before continuing to use Mockly.",
      "Continued use after updated terms take effect constitutes acceptance if re-acceptance is not required by the product flow.",
    ],
  },
  {
    id: "contact",
    title: "13. Contact",
    paragraphs: [
      `Questions about these Terms, your data, or account deletion requests: ${TERMS_CONTACT_EMAIL}.`,
    ],
  },
];
