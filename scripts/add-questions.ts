import { db } from "../server/db";
import { interviewQuestions } from "@shared/schema";

const softwareEngineerQuestions = [
  { q: "Describe a time when you had to debug a particularly challenging bug. How did you approach it?", cat: "problem-solving", diff: "medium" },
  { q: "How do you stay current with new technologies and programming languages?", cat: "learning", diff: "easy" },
  { q: "Tell me about a time when you disagreed with a technical decision. How did you handle it?", cat: "behavioral", diff: "medium" },
  { q: "Explain how you would design a system to handle millions of concurrent users.", cat: "system-design", diff: "hard" },
  { q: "What's your approach to code reviews? How do you give and receive feedback?", cat: "communication", diff: "medium" },
  { q: "Describe a project where you had to make tradeoffs between code quality and shipping quickly.", cat: "decision-making", diff: "medium" },
  { q: "How do you approach testing your code? What testing strategies do you use?", cat: "technical", diff: "medium" },
  { q: "Tell me about a time when you had to learn a new technology quickly for a project.", cat: "learning", diff: "easy" },
  { q: "How would you optimize a slow database query?", cat: "technical", diff: "medium" },
  { q: "Describe your experience with agile development and working in sprints.", cat: "process", diff: "easy" },
  { q: "What's the most complex system you've designed? Walk me through your thinking.", cat: "system-design", diff: "hard" },
  { q: "How do you handle technical debt in a codebase?", cat: "technical", diff: "medium" },
  { q: "Tell me about a time when you mentored a junior developer.", cat: "leadership", diff: "medium" },
  { q: "What strategies do you use for writing maintainable code?", cat: "technical", diff: "medium" },
  { q: "Describe a situation where you had to refactor legacy code.", cat: "problem-solving", diff: "hard" },
  { q: "How do you prioritize technical tasks when everything seems urgent?", cat: "decision-making", diff: "medium" },
  { q: "What's your experience with microservices architecture?", cat: "technical", diff: "hard" },
  { q: "Tell me about a time when you automated a manual process.", cat: "problem-solving", diff: "medium" },
  { q: "How do you ensure your code is secure?", cat: "technical", diff: "medium" },
  { q: "Describe your ideal development environment and workflow.", cat: "process", diff: "easy" },
];

const productManagerQuestions = [
  { q: "Tell me about a product you launched from concept to release. What was your role?", cat: "product-lifecycle", diff: "medium" },
  { q: "How do you prioritize features when resources are limited?", cat: "decision-making", diff: "medium" },
  { q: "Describe a time when you had to say no to a stakeholder request. How did you handle it?", cat: "communication", diff: "medium" },
  { q: "How do you measure product success? What metrics do you track?", cat: "analytics", diff: "medium" },
  { q: "Tell me about a time when you had to pivot a product strategy based on user feedback.", cat: "adaptability", diff: "medium" },
  { q: "How do you work with engineering teams to define technical requirements?", cat: "collaboration", diff: "medium" },
  { q: "Describe your process for conducting user research.", cat: "research", diff: "medium" },
  { q: "How do you handle competing priorities from different stakeholders?", cat: "conflict-resolution", diff: "hard" },
  { q: "Tell me about a failed product or feature. What did you learn?", cat: "learning", diff: "hard" },
  { q: "How do you create and manage a product roadmap?", cat: "planning", diff: "medium" },
  { q: "Describe how you would enter a new market with an existing product.", cat: "strategy", diff: "hard" },
  { q: "What frameworks do you use for product prioritization?", cat: "process", diff: "medium" },
  { q: "How do you balance user needs with business goals?", cat: "decision-making", diff: "medium" },
  { q: "Tell me about a time when you used data to make a product decision.", cat: "analytics", diff: "medium" },
  { q: "How do you communicate product vision to your team?", cat: "leadership", diff: "medium" },
  { q: "Describe your experience with A/B testing and experimentation.", cat: "analytics", diff: "medium" },
  { q: "How do you handle technical debt when planning your roadmap?", cat: "planning", diff: "hard" },
  { q: "Tell me about a time when you had to make a decision with incomplete information.", cat: "decision-making", diff: "hard" },
  { q: "How do you work with design teams to create user-friendly products?", cat: "collaboration", diff: "medium" },
  { q: "What's your approach to competitive analysis?", cat: "research", diff: "medium" },
];

const marketingQuestions = [
  { q: "Describe a successful marketing campaign you've led. What made it successful?", cat: "campaign-management", diff: "medium" },
  { q: "How do you measure the ROI of marketing campaigns?", cat: "analytics", diff: "medium" },
  { q: "Tell me about a time when a campaign didn't perform as expected. How did you respond?", cat: "adaptability", diff: "medium" },
  { q: "How do you identify and segment target audiences?", cat: "strategy", diff: "medium" },
  { q: "Describe your experience with digital marketing channels (SEO, SEM, social media, email).", cat: "technical", diff: "medium" },
  { q: "How do you stay current with marketing trends and best practices?", cat: "learning", diff: "easy" },
  { q: "Tell me about a time when you had to work with a limited budget.", cat: "resource-management", diff: "medium" },
  { q: "How do you approach brand positioning and messaging?", cat: "strategy", diff: "medium" },
  { q: "Describe your process for creating a content marketing strategy.", cat: "planning", diff: "medium" },
  { q: "How do you collaborate with sales teams to generate qualified leads?", cat: "collaboration", diff: "medium" },
  { q: "Tell me about your experience with marketing automation tools.", cat: "technical", diff: "medium" },
  { q: "How do you optimize conversion rates across the customer journey?", cat: "optimization", diff: "hard" },
  { q: "Describe a time when you used data to pivot a marketing strategy.", cat: "analytics", diff: "medium" },
  { q: "How do you manage multiple campaigns simultaneously?", cat: "project-management", diff: "medium" },
  { q: "What's your approach to influencer or partnership marketing?", cat: "strategy", diff: "medium" },
  { q: "Tell me about your experience with customer retention strategies.", cat: "strategy", diff: "medium" },
  { q: "How do you handle negative feedback or a PR crisis?", cat: "crisis-management", diff: "hard" },
  { q: "Describe your process for competitive marketing analysis.", cat: "research", diff: "medium" },
  { q: "How do you test and optimize email marketing campaigns?", cat: "optimization", diff: "medium" },
  { q: "What's your experience with growth hacking or viral marketing?", cat: "growth", diff: "hard" },
];

async function insertQuestions() {
  console.log("🚀 Adding interview questions to database...\n");

  // Software Engineer
  console.log("📝 Adding Software Engineer questions...");
  for (let i = 0; i < softwareEngineerQuestions.length; i++) {
    const q = softwareEngineerQuestions[i];
    await db.insert(interviewQuestions).values({
      role: "software-engineer",
      questionText: q.q,
      category: q.cat,
      difficulty: q.diff,
      orderIndex: i + 100, // Offset to avoid conflicts
    });
  }
  console.log(`✅ Added ${softwareEngineerQuestions.length} Software Engineer questions\n`);

  // Product Manager
  console.log("📝 Adding Product Manager questions...");
  for (let i = 0; i < productManagerQuestions.length; i++) {
    const q = productManagerQuestions[i];
    await db.insert(interviewQuestions).values({
      role: "product-manager",
      questionText: q.q,
      category: q.cat,
      difficulty: q.diff,
      orderIndex: i + 100,
    });
  }
  console.log(`✅ Added ${productManagerQuestions.length} Product Manager questions\n`);

  // Marketing
  console.log("📝 Adding Marketing questions...");
  for (let i = 0; i < marketingQuestions.length; i++) {
    const q = marketingQuestions[i];
    await db.insert(interviewQuestions).values({
      role: "marketing",
      questionText: q.q,
      category: q.cat,
      difficulty: q.diff,
      orderIndex: i + 100,
    });
  }
  console.log(`✅ Added ${marketingQuestions.length} Marketing questions\n`);

  console.log("🎉 All done! Total questions added:", 
    softwareEngineerQuestions.length + productManagerQuestions.length + marketingQuestions.length);
  
  process.exit(0);
}

insertQuestions().catch((error) => {
  console.error("❌ Error:", error);
  process.exit(1);
});
