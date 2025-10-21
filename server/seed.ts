import { db } from './db';
import { interviewQuestions } from '../shared/schema';

const questionData = [
  {
    role: "software-engineer",
    questionText: "Tell me about a challenging technical problem you solved recently.",
    category: "Technical Experience",
    difficulty: "medium",
    orderIndex: 1
  },
  {
    role: "software-engineer",
    questionText: "How do you approach debugging a complex issue in production?",
    category: "Problem Solving",
    difficulty: "medium",
    orderIndex: 2
  },
  {
    role: "software-engineer",
    questionText: "Explain how you would design a scalable system for handling millions of users.",
    category: "System Design",
    difficulty: "hard",
    orderIndex: 3
  },
  {
    role: "software-engineer",
    questionText: "Describe your experience with agile development and continuous integration.",
    category: "Development Process",
    difficulty: "easy",
    orderIndex: 4
  },
  {
    role: "software-engineer",
    questionText: "How do you stay updated with new technologies and programming languages?",
    category: "Learning & Growth",
    difficulty: "easy",
    orderIndex: 5
  },
  {
    role: "product-manager",
    questionText: "How do you prioritize features when you have limited resources?",
    category: "Product Strategy",
    difficulty: "medium",
    orderIndex: 1
  },
  {
    role: "product-manager",
    questionText: "Tell me about a time you had to make a difficult product decision with incomplete data.",
    category: "Decision Making",
    difficulty: "hard",
    orderIndex: 2
  },
  {
    role: "product-manager",
    questionText: "How do you gather and incorporate user feedback into your product roadmap?",
    category: "User Research",
    difficulty: "medium",
    orderIndex: 3
  },
  {
    role: "product-manager",
    questionText: "Describe your process for defining and measuring product success metrics.",
    category: "Analytics",
    difficulty: "medium",
    orderIndex: 4
  },
  {
    role: "product-manager",
    questionText: "How do you work with engineering teams to balance technical debt and new features?",
    category: "Cross-functional Collaboration",
    difficulty: "hard",
    orderIndex: 5
  },
  {
    role: "marketing",
    questionText: "How would you develop a go-to-market strategy for a new product launch?",
    category: "Strategy",
    difficulty: "hard",
    orderIndex: 1
  },
  {
    role: "marketing",
    questionText: "Describe a successful marketing campaign you've led and what made it successful.",
    category: "Campaign Management",
    difficulty: "medium",
    orderIndex: 2
  },
  {
    role: "marketing",
    questionText: "How do you measure and optimize marketing ROI across different channels?",
    category: "Analytics",
    difficulty: "medium",
    orderIndex: 3
  },
  {
    role: "marketing",
    questionText: "Tell me about your experience with content marketing and SEO.",
    category: "Content & SEO",
    difficulty: "easy",
    orderIndex: 4
  },
  {
    role: "marketing",
    questionText: "How do you stay on top of marketing trends and adapt your strategy accordingly?",
    category: "Industry Knowledge",
    difficulty: "easy",
    orderIndex: 5
  }
];

async function seed() {
  try {
    console.log('Starting database seed...');
    
    const existing = await db.select().from(interviewQuestions);
    
    if (existing.length > 0) {
      console.log(`Database already has ${existing.length} questions. Skipping seed.`);
      console.log('If you want to reseed, manually delete questions first.');
      return;
    }
    
    console.log('Inserting interview questions...');
    await db.insert(interviewQuestions).values(questionData);
    
    console.log(`✅ Successfully seeded ${questionData.length} interview questions!`);
    console.log('Questions by role:');
    console.log('  - Software Engineer: 5 questions');
    console.log('  - Product Manager: 5 questions');
    console.log('  - Marketing: 5 questions');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  }
}

seed();
