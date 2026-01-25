/**
 * Comprehensive Test Script for Adaptive AI Evaluation System
 * 
 * Tests the new adaptive rubric with:
 * - Question type detection (behavioral, technical, situational, informational)
 * - Conditional STAR Structure (only for behavioral)
 * - Resume context integration
 * - Role/major context
 * - Coachability emphasis for entry-level candidates
 * 
 * Usage:
 *   cd backend
 *   OPENAI_API_KEY=your-key npx tsx test-adaptive-evaluator.ts
 */

import { config } from 'dotenv';
import { scoreInterview } from './server/llm/openaiEvaluator.js';

// Load environment variables from .env file
config();

// Sample resume text for testing resume context
const sampleResume = `
JOHN DOE
Software Engineering Student
Email: john.doe@university.edu | Phone: (555) 123-4567

EDUCATION
Bachelor of Science in Computer Science
State University | Expected Graduation: May 2025
GPA: 3.7/4.0

SKILLS
Programming Languages: Python, JavaScript, Java, C++
Web Technologies: React, Node.js, Express, HTML, CSS
Databases: PostgreSQL, MongoDB
Tools: Git, Docker, VS Code

EXPERIENCE
Software Development Intern | Tech Company Inc. | Summer 2024
- Developed RESTful APIs using Node.js and Express
- Collaborated with team of 5 developers on web application
- Reduced API response time by 30% through optimization
- Participated in code reviews and agile sprints

PROJECTS
E-Commerce Platform | Personal Project | 2024
- Built full-stack web application using React and Node.js
- Implemented user authentication and payment processing
- Deployed application using Docker and AWS

Academic Database System | Course Project | 2023
- Designed and implemented database schema for student management
- Created REST API endpoints for data retrieval
- Worked in team of 4 students
`;

async function testAdaptiveEvaluator() {
  console.log('🧪 Testing Adaptive AI Evaluation System\n');
  console.log('='.repeat(60));
  console.log('Testing Features:');
  console.log('  1. Question Type Detection (Behavioral, Technical, Situational, Informational)');
  console.log('  2. Conditional STAR Structure (only for behavioral)');
  console.log('  3. Resume Context Integration');
  console.log('  4. Role/Major Context');
  console.log('  5. Coachability Emphasis for Entry-Level');
  console.log('='.repeat(60));
  console.log('');

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('❌ OPENAI_API_KEY environment variable is required');
    console.error('   Set it with: export OPENAI_API_KEY=your-key');
    process.exit(1);
  }

  // Test Case 1: Mixed Question Types
  console.log('📋 TEST CASE 1: Mixed Question Types\n');
  const mixedQuestions = [
    {
      question: "Can you tell me about yourself?",
      answer: "Hi! I'm a computer science student at State University, graduating in May 2025. I've been passionate about software development since high school. I completed an internship last summer where I worked on web applications using React and Node.js. I'm really excited about this opportunity because I love building user-friendly interfaces and solving technical challenges.",
    },
    {
      question: "Tell me about a time when you had to work in a team to solve a difficult problem.",
      answer: "During my internship, we had a critical bug that was affecting our production system. The situation was that users couldn't complete their transactions. My task was to help identify and fix the issue. I took action by analyzing the logs, working with the team to trace the problem, and we found it was a database connection issue. As a result, we fixed it within 4 hours and prevented further user impact. I learned a lot about debugging under pressure.",
    },
    {
      question: "What is object-oriented programming?",
      answer: "Object-oriented programming is a programming paradigm that organizes code into objects, which are instances of classes. The main principles are encapsulation, inheritance, and polymorphism. Encapsulation means bundling data and methods together. Inheritance allows classes to inherit properties from parent classes. Polymorphism lets objects of different types be treated through the same interface. It's widely used in languages like Java, Python, and C++.",
    },
    {
      question: "What would you do if you were assigned a project with a technology you've never used before?",
      answer: "I would start by researching the technology thoroughly - reading documentation, watching tutorials, and understanding the core concepts. Then I'd create a small practice project to get hands-on experience. I'd also reach out to colleagues or online communities for guidance. I believe in learning by doing, so I'd break down the project into smaller tasks and tackle them one by one. I'm always eager to learn new technologies and see them as opportunities to grow.",
    },
  ];

  console.log('Questions to evaluate:');
  mixedQuestions.forEach((qa, i) => {
    console.log(`\n${i + 1}. [${getQuestionType(qa.question)}] ${qa.question}`);
    console.log(`   Answer: ${qa.answer.substring(0, 100)}...`);
  });

  console.log('\n\n🔄 Calling OpenAI evaluator with role, major, and resume context...\n');

  try {
    const startTime = Date.now();
    const evaluation = await scoreInterview({
      role: 'Software Engineer Intern',
      major: 'Computer Science',
      resumeText: sampleResume,
      questions: mixedQuestions,
    });

    const duration = Date.now() - startTime;
    console.log(`✅ Evaluation completed in ${duration}ms\n`);
    console.log('='.repeat(60));
    console.log('📊 EVALUATION RESULTS');
    console.log('='.repeat(60));
    console.log(`\nOverall Score: ${evaluation.overall_score}/100\n`);

    // Test Question Type Detection
    console.log('🔍 QUESTION TYPE DETECTION TEST:\n');
    mixedQuestions.forEach((qa, i) => {
      const evalQ = evaluation.questions[i];
      const expectedType = getQuestionType(qa.question);
      console.log(`Question ${i + 1}: "${qa.question.substring(0, 50)}..."`);
      console.log(`  Expected Type: ${expectedType}`);
      console.log(`  Score: ${evalQ.score}/100`);
      console.log(`  Strengths: ${evalQ.strengths.join('; ')}`);
      console.log(`  Improvements: ${evalQ.improvements.join('; ')}`);
      
      // Check if STAR is mentioned (should only be for behavioral)
      const mentionsSTAR = evalQ.strengths.some(s => s.toLowerCase().includes('star')) ||
                          evalQ.improvements.some(i => i.toLowerCase().includes('star'));
      if (expectedType === 'behavioral' && !mentionsSTAR) {
        console.log(`  ⚠️  WARNING: Behavioral question but STAR not mentioned in feedback`);
      } else if (expectedType !== 'behavioral' && mentionsSTAR) {
        console.log(`  ⚠️  WARNING: Non-behavioral question but STAR mentioned (should not evaluate STAR)`);
      } else {
        console.log(`  ✅ STAR evaluation appropriate for question type`);
      }
      console.log('');
    });

    // Overall feedback
    if (evaluation.overall_strengths && evaluation.overall_strengths.length > 0) {
      console.log('Overall Strengths:');
      evaluation.overall_strengths.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
      console.log('');
    }

    if (evaluation.overall_improvements && evaluation.overall_improvements.length > 0) {
      console.log('Overall Improvements:');
      evaluation.overall_improvements.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
      console.log('');
    }

    // Check for resume alignment mentions
    console.log('📄 RESUME CONTEXT TEST:\n');
    const resumeMentions = [
      ...evaluation.overall_strengths,
      ...evaluation.overall_improvements,
      ...evaluation.questions.flatMap(q => [...q.strengths, ...q.improvements])
    ].filter(text => 
      text.toLowerCase().includes('resume') || 
      text.toLowerCase().includes('internship') ||
      text.toLowerCase().includes('experience')
    );
    
    if (resumeMentions.length > 0) {
      console.log('✅ Resume context appears to be used:');
      resumeMentions.slice(0, 3).forEach(m => console.log(`  - ${m}`));
    } else {
      console.log('⚠️  No clear resume alignment mentions found');
    }
    console.log('');

    // Check for coachability emphasis
    console.log('🎓 COACHABILITY TEST:\n');
    const coachabilityMentions = [
      ...evaluation.overall_strengths,
      ...evaluation.overall_improvements,
      ...evaluation.questions.flatMap(q => [...q.strengths, ...q.improvements])
    ].filter(text => 
      text.toLowerCase().includes('learn') ||
      text.toLowerCase().includes('growth') ||
      text.toLowerCase().includes('potential') ||
      text.toLowerCase().includes('coachability') ||
      text.toLowerCase().includes('willingness')
    );
    
    if (coachabilityMentions.length > 0) {
      console.log('✅ Coachability appears to be emphasized:');
      coachabilityMentions.slice(0, 3).forEach(m => console.log(`  - ${m}`));
    } else {
      console.log('⚠️  Limited coachability mentions (expected for entry-level)');
    }
    console.log('');

    // Schema validation
    console.log('✅ SCHEMA VALIDATION:\n');
    const assertions = [
      { name: 'overall_score is number', pass: typeof evaluation.overall_score === 'number' },
      { name: 'overall_score in range 0-100', pass: evaluation.overall_score >= 0 && evaluation.overall_score <= 100 },
      { name: 'overall_score is integer', pass: Number.isInteger(evaluation.overall_score) },
      { name: 'questions.length matches input', pass: evaluation.questions.length === mixedQuestions.length },
      { name: 'overall_strengths exists and is array', pass: Array.isArray(evaluation.overall_strengths) && evaluation.overall_strengths.length > 0 },
      { name: 'overall_improvements exists and is array', pass: Array.isArray(evaluation.overall_improvements) && evaluation.overall_improvements.length > 0 },
    ];

    evaluation.questions.forEach((q, i) => {
      assertions.push(
        { name: `Question ${i + 1} has score`, pass: typeof q.score === 'number' },
        { name: `Question ${i + 1} score in range`, pass: q.score >= 0 && q.score <= 100 },
        { name: `Question ${i + 1} score is integer`, pass: Number.isInteger(q.score) },
        { name: `Question ${i + 1} has strengths`, pass: Array.isArray(q.strengths) && q.strengths.length > 0 },
        { name: `Question ${i + 1} has improvements`, pass: Array.isArray(q.improvements) && q.improvements.length > 0 },
      );
    });

    let allPassed = true;
    assertions.forEach(assertion => {
      const status = assertion.pass ? '✅' : '❌';
      console.log(`  ${status} ${assertion.name}`);
      if (!assertion.pass) allPassed = false;
    });

    console.log('\n' + '='.repeat(60));
    console.log('📝 DETAILED QUESTION EVALUATIONS');
    console.log('='.repeat(60));
    
    evaluation.questions.forEach((q, i) => {
      console.log(`\nQuestion ${i + 1}: ${q.question}`);
      console.log(`Answer: ${q.answer.substring(0, 150)}...`);
      console.log(`Score: ${q.score}/100`);
      console.log(`Strengths:`);
      q.strengths.forEach(s => console.log(`  • ${s}`));
      console.log(`Improvements:`);
      q.improvements.forEach(i => console.log(`  • ${i}`));
    });

    console.log('\n' + '='.repeat(60));
    if (allPassed) {
      console.log('✅ All schema validations passed!');
      console.log('='.repeat(60));
      process.exit(0);
    } else {
      console.log('❌ Some schema validations failed');
      console.log('='.repeat(60));
      process.exit(1);
    }
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Helper function to classify question type (for testing)
function getQuestionType(question: string): string {
  const q = question.toLowerCase();
  if (q.includes('tell me about a time') || q.includes('describe a situation') || 
      q.includes('give an example') || q.includes('share an experience')) {
    return 'behavioral';
  }
  if (q.includes('what is') || q.includes('explain') || q.includes('how does') ||
      q.includes('define') || q.includes('what are')) {
    return 'technical';
  }
  if (q.includes('what would you do') || q.includes('how would you handle') ||
      q.includes('if you were')) {
    return 'situational';
  }
  return 'informational';
}

testAdaptiveEvaluator();
