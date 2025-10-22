import { db } from "../server/db";
import { interviewQuestions } from "@shared/schema";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const roles = [
  { name: "software-engineer", displayName: "Software Engineer", count: 20 },
  { name: "product-manager", displayName: "Product Manager", count: 20 },
  { name: "marketing", displayName: "Marketing Manager", count: 20 },
];

async function generateQuestionsForRole(role: string, displayName: string, count: number) {
  console.log(`\n🎯 Generating ${count} questions for ${displayName}...`);

  const prompt = `Generate exactly ${count} diverse, realistic interview questions for a ${displayName} position.

Requirements:
- Mix of behavioral, technical, and situational questions
- Vary difficulty levels (easy, medium, hard)
- Different categories: problem-solving, leadership, communication, technical skills, past experience
- Make them practical and commonly asked in real interviews
- Each question should be unique and thought-provoking

Return ONLY a JSON array of objects with this structure:
[
  {
    "questionText": "Tell me about a time when...",
    "category": "behavioral",
    "difficulty": "medium"
  }
]`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
  });

  const content = response.choices[0].message.content;
  const result = JSON.parse(content!);
  const questions = Array.isArray(result) ? result : (result.questions || []);
  
  if (!questions || questions.length === 0) {
    console.error("No questions generated!");
    return;
  }

  // Insert questions into database
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    await db.insert(interviewQuestions).values({
      role,
      questionText: q.questionText,
      category: q.category || "general",
      difficulty: q.difficulty || "medium",
      orderIndex: i + 1,
    });
    console.log(`  ✓ Added: ${q.questionText.substring(0, 60)}...`);
  }

  console.log(`✅ Successfully added ${questions.length} questions for ${displayName}`);
}

async function main() {
  console.log("🚀 Starting question generation...\n");

  for (const { name, displayName, count } of roles) {
    await generateQuestionsForRole(name, displayName, count);
  }

  console.log("\n🎉 All questions generated successfully!");
  process.exit(0);
}

main().catch((error) => {
  console.error("❌ Error:", error);
  process.exit(1);
});
