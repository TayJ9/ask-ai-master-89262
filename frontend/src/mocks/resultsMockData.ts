/**
 * Mock interview results data for local development/preview
 * Use ?mock=true in the URL to enable mock mode
 */

export const mockInterviewResults = {
  interview: {
    id: "mock-interview-id-123",
    conversationId: "mock-conversation-id-456",
    agentId: "agent_8601kavsezrheczradx9qmz8qp3e",
    transcript: `Interviewer: Can you tell me about yourself and your background?

Candidate: Sure! I'm a recent computer science graduate from the University of Technology. I've been passionate about software development for the past four years, and I've completed several internships during my studies. My main focus has been on full-stack web development, particularly with React and Node.js.

Interviewer: That's great! What would you say are your biggest strengths as a developer?

Candidate: I think my biggest strengths are my problem-solving abilities and my willingness to learn. I'm always eager to tackle new challenges and I enjoy breaking down complex problems into smaller, manageable pieces. I also work well in teams and I'm good at communicating technical concepts to both technical and non-technical stakeholders.

Interviewer: Can you describe a challenging project you've worked on and how you handled it?

Candidate: Absolutely. During my last internship, I was tasked with optimizing a database query that was taking over 30 seconds to execute. The application was experiencing significant performance issues. I started by analyzing the query execution plan and identified several missing indexes. I also refactored the query to eliminate unnecessary joins and added proper indexing. After these changes, the query time dropped to under 200 milliseconds. The key was systematic debugging and understanding the underlying database structure.

Interviewer: How do you handle tight deadlines or pressure situations?

Candidate: I prioritize tasks based on their impact and urgency. I break down large tasks into smaller milestones and communicate regularly with my team about progress and any blockers. I also make sure to maintain code quality even under pressure, because I've learned that cutting corners usually leads to more problems later. I stay organized and use project management tools to track my progress.

Interviewer: What are you looking for in your next role?

Candidate: I'm looking for a role where I can continue to grow as a developer and work on meaningful projects. I want to be part of a team that values collaboration and continuous learning. I'm particularly interested in working with modern technologies and contributing to products that have a real impact on users. I'm also excited about the opportunity to learn from more experienced developers and take on increasing responsibility over time.`,
    durationSeconds: 420, // 7 minutes
    startedAt: new Date(Date.now() - 420000).toISOString(),
    endedAt: new Date().toISOString(),
    status: "completed",
    createdAt: new Date(Date.now() - 420000).toISOString(),
  },
  evaluation: {
    status: "complete",
    overallScore: 86,
    evaluation: {
      overall_score: 86,
      overall_strengths: [
        "Strong technical foundation with clear understanding of software development principles",
        "Excellent problem-solving approach demonstrated through concrete examples",
        "Good communication skills and ability to articulate technical concepts clearly",
        "Shows maturity in handling pressure and maintaining code quality under deadlines"
      ],
      overall_improvements: [
        "Could provide more specific examples of leadership or mentoring experiences",
        "Consider discussing experience with testing frameworks and CI/CD pipelines",
        "Mention any contributions to open source or personal projects in more detail"
      ],
      questions: [
        {
          question: "Can you tell me about yourself and your background?",
          answer: "Sure! I'm a recent computer science graduate from the University of Technology. I've been passionate about software development for the past four years, and I've completed several internships during my studies. My main focus has been on full-stack web development, particularly with React and Node.js.",
          score: 88,
          strengths: [
            "Clear and concise introduction",
            "Relevant educational background mentioned",
            "Specific technologies highlighted (React, Node.js)"
          ],
          improvements: [
            "Could mention specific projects or achievements from internships",
            "Consider adding what drew you to software development initially"
          ],
        },
        {
          question: "What would you say are your biggest strengths as a developer?",
          answer: "I think my biggest strengths are my problem-solving abilities and my willingness to learn. I'm always eager to tackle new challenges and I enjoy breaking down complex problems into smaller, manageable pieces. I also work well in teams and I'm good at communicating technical concepts to both technical and non-technical stakeholders.",
          score: 87,
          strengths: [
            "Identifies concrete strengths (problem-solving, learning)",
            "Mentions both technical and soft skills",
            "Shows awareness of communication importance"
          ],
          improvements: [
            "Could provide a specific example demonstrating these strengths",
            "Consider mentioning how you've applied these strengths in past projects"
          ],
          sample_better_answer: "My biggest strengths are my problem-solving abilities and my eagerness to learn. For example, when I encountered a performance issue with a database query taking 30 seconds, I systematically analyzed the execution plan, identified missing indexes, and reduced it to under 200ms. I also excel at breaking down complex problems into manageable pieces and communicating technical concepts clearly to both technical and non-technical stakeholders, which I've found crucial in collaborative environments."
        },
        {
          question: "Can you describe a challenging project you've worked on and how you handled it?",
          answer: "Absolutely. During my last internship, I was tasked with optimizing a database query that was taking over 30 seconds to execute. The application was experiencing significant performance issues. I started by analyzing the query execution plan and identified several missing indexes. I also refactored the query to eliminate unnecessary joins and added proper indexing. After these changes, the query time dropped to under 200 milliseconds. The key was systematic debugging and understanding the underlying database structure.",
          score: 92,
          strengths: [
            "Excellent use of the STAR method (Situation, Task, Action, Result)",
            "Specific metrics provided (30 seconds to 200ms)",
            "Clear explanation of technical approach",
            "Shows systematic problem-solving process"
          ],
          improvements: [
            "Could mention any collaboration or learning from teammates during this project",
            "Consider discussing what you learned from this experience"
          ],
          sample_better_answer: "During my last internship, I tackled a critical performance issue where a database query was taking over 30 seconds, causing significant user experience problems. I took ownership by first analyzing the query execution plan to understand the bottleneck. I discovered missing indexes and unnecessary joins. I collaborated with the senior developer to review my approach, then implemented proper indexing and query optimization. The result was reducing query time to under 200 milliseconds - a 99% improvement. This experience taught me the importance of systematic debugging and the impact of database optimization on user experience."
        },
        {
          question: "How do you handle tight deadlines or pressure situations?",
          answer: "I prioritize tasks based on their impact and urgency. I break down large tasks into smaller milestones and communicate regularly with my team about progress and any blockers. I also make sure to maintain code quality even under pressure, because I've learned that cutting corners usually leads to more problems later. I stay organized and use project management tools to track my progress.",
          score: 83,
          strengths: [
            "Shows structured approach to time management",
            "Emphasizes communication and transparency",
            "Demonstrates understanding of technical debt risks"
          ],
          improvements: [
            "Could provide a specific example of handling a tight deadline",
            "Consider mentioning how you balance speed and quality in practice"
          ],
          sample_better_answer: "I handle tight deadlines by first assessing the scope and breaking it into prioritized milestones. For example, when we had a critical bug to fix before a product launch, I quickly identified the root cause, created a minimal fix for immediate deployment, then scheduled a more robust solution for the next sprint. I maintain constant communication with my team about progress and blockers, and I've learned that maintaining code quality even under pressure prevents future issues. I use project management tools to track progress and ensure nothing falls through the cracks."
        },
        {
          question: "What are you looking for in your next role?",
          answer: "I'm looking for a role where I can continue to grow as a developer and work on meaningful projects. I want to be part of a team that values collaboration and continuous learning. I'm particularly interested in working with modern technologies and contributing to products that have a real impact on users. I'm also excited about the opportunity to learn from more experienced developers and take on increasing responsibility over time.",
          score: 80,
          strengths: [
            "Shows genuine interest in growth and learning",
            "Mentions desire for meaningful work",
            "Expresses interest in mentorship and collaboration"
          ],
          improvements: [
            "Could be more specific about what technologies or domains interest you",
            "Consider mentioning what type of impact you want to make",
            "Could express more enthusiasm and passion"
          ],
          sample_better_answer: "I'm looking for a role where I can grow as a developer while working on products that make a real difference. I'm particularly excited about opportunities in fintech or healthcare tech, where code directly impacts people's lives. I want to join a team that values both technical excellence and collaboration, where I can learn from experienced developers through code reviews and pair programming. I'm eager to take on increasing responsibility, whether that's leading a feature, mentoring interns, or contributing to architectural decisions. Most importantly, I want to work somewhere that values continuous learning and gives me the opportunity to explore new technologies and best practices."
        }
      ]
    },
    error: null,
    createdAt: new Date(Date.now() - 300000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  metadata: {
    userId: "mock-user-id-789",
    userEmail: "test@example.com",
  },
};
