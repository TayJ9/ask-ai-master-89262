/**
 * Test script for OpenAI Interview Evaluator
 * 
 * Tests the OpenAI evaluator end-to-end with a sample transcript.
 * 
 * Usage:
 *   OPENAI_API_KEY=your-key node test-openai-evaluator.js
 */

import { scoreInterview } from './server/llm/openaiEvaluator.js';

async function testOpenAIEvaluator() {
  console.log('🧪 Testing OpenAI Interview Evaluator\n');

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('❌ OPENAI_API_KEY environment variable is required');
    process.exit(1);
  }

  // Sample Q&A pairs from a typical interview
  const sampleQuestions = [
    {
      question: "Can you tell me about yourself?",
      answer: "Hi! I'm a software engineer with 5 years of experience. I've built several web applications using React and Node.js. I led a team of 3 developers and we increased user engagement by 40% last quarter. I'm passionate about creating user-friendly interfaces and solving complex technical problems.",
    },
    {
      question: "Can you describe a challenging project you worked on?",
      answer: "Sure! I designed and implemented a real-time chat system that handles 10,000 concurrent users. I used WebSockets and Redis for caching. It was challenging because we had to ensure low latency while maintaining data consistency. We ended up reducing response time by 60%.",
    },
    {
      question: "How do you handle debugging complex issues?",
      answer: "I start by reproducing the issue, then I analyze the logs and use debugging tools. I've fixed over 50 production bugs in the past year. I also write unit tests to prevent regressions. I usually break down the problem into smaller parts and test each component.",
    },
  ];

  console.log('Sample Questions:');
  sampleQuestions.forEach((qa, i) => {
    console.log(`\n${i + 1}. ${qa.question}`);
    console.log(`   Answer: ${qa.answer.substring(0, 80)}...`);
  });

  console.log('\n\nCalling OpenAI evaluator...\n');

  try {
    const startTime = Date.now();
    const evaluation = await scoreInterview({
      role: 'Software Engineer Intern',
      major: 'Computer Science',
      questions: sampleQuestions,
    });

    const duration = Date.now() - startTime;
    console.log(`✅ Evaluation completed in ${duration}ms\n`);

    // Assertions
    console.log('📊 Evaluation Results:\n');
    console.log(`Overall Score: ${evaluation.overall_score}/100\n`);

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

    console.log(`Questions Evaluated: ${evaluation.questions.length}\n`);

    // Validate structure
    const assertions = [
      { name: 'overall_score is number', pass: typeof evaluation.overall_score === 'number' },
      { name: 'overall_score in range 0-100', pass: evaluation.overall_score >= 0 && evaluation.overall_score <= 100 },
      { name: 'questions.length > 0', pass: evaluation.questions.length > 0 },
      { name: 'overall_strengths exists', pass: Array.isArray(evaluation.overall_strengths) },
      { name: 'overall_improvements exists', pass: Array.isArray(evaluation.overall_improvements) },
    ];

    evaluation.questions.forEach((q, i) => {
      assertions.push(
        { name: `Question ${i + 1} has score`, pass: typeof q.score === 'number' },
        { name: `Question ${i + 1} score in range`, pass: q.score >= 0 && q.score <= 100 },
        { name: `Question ${i + 1} has sample_better_answer`, pass: typeof q.sample_better_answer === 'string' && q.sample_better_answer.length >= 20 },
        { name: `Question ${i + 1} has strengths`, pass: Array.isArray(q.strengths) && q.strengths.length > 0 },
        { name: `Question ${i + 1} has improvements`, pass: Array.isArray(q.improvements) && q.improvements.length > 0 },
      );
    });

    console.log('✅ Assertions:');
    let allPassed = true;
    assertions.forEach(assertion => {
      const status = assertion.pass ? '✅' : '❌';
      console.log(`  ${status} ${assertion.name}`);
      if (!assertion.pass) allPassed = false;
    });

    console.log('\n📝 Sample Question Evaluation:');
    const firstQuestion = evaluation.questions[0];
    console.log(`\nQuestion: ${firstQuestion.question}`);
    console.log(`Answer: ${firstQuestion.answer.substring(0, 100)}...`);
    console.log(`Score: ${firstQuestion.score}/100`);
    console.log(`Strengths: ${firstQuestion.strengths.join(', ')}`);
    console.log(`Improvements: ${firstQuestion.improvements.join(', ')}`);
    console.log(`Sample Better Answer: ${firstQuestion.sample_better_answer}`);

    console.log('\n📋 Full Evaluation JSON:');
    console.log(JSON.stringify(evaluation, null, 2));

    if (allPassed) {
      console.log('\n✅ All assertions passed!');
      process.exit(0);
    } else {
      console.log('\n❌ Some assertions failed');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

testOpenAIEvaluator();

