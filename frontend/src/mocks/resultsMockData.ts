/**
 * Mock interview results data for local development/preview
 * Use ?demo=true in the URL to enable demo mode
 * 
 * This demo showcases:
 * - Realistic resume-based candidate profile
 * - Mixed question types (behavioral, technical, situational, informational)
 * - Varied response quality to demonstrate scoring system
 * - Resume-aligned responses showing context integration
 */

// Demo candidate resume (for reference in evaluation)
export const demoResume = `
ALEXANDRA CHEN
Software Engineering Student
Email: alex.chen@stateuniversity.edu | Phone: (555) 234-5678
LinkedIn: linkedin.com/in/alexandrachen | GitHub: github.com/alexchen

EDUCATION
Bachelor of Science in Computer Science
State University | Expected Graduation: May 2025
GPA: 3.8/4.0 | Dean's List: Fall 2022, Spring 2023, Fall 2023
Relevant Coursework: Data Structures & Algorithms, Database Systems, Web Development, 
Software Engineering, Operating Systems, Computer Networks

TECHNICAL SKILLS
Programming Languages: Python, JavaScript, TypeScript, Java, C++, SQL
Frontend: React, Next.js, HTML5, CSS3, Tailwind CSS, Redux
Backend: Node.js, Express.js, REST APIs, GraphQL
Databases: PostgreSQL, MongoDB, Redis
Tools & Technologies: Git, Docker, AWS (EC2, S3), Jest, Postman, VS Code
Methodologies: Agile/Scrum, Test-Driven Development, CI/CD

PROFESSIONAL EXPERIENCE
Software Development Intern | TechCorp Solutions | Summer 2024
• Developed and maintained RESTful APIs using Node.js and Express for customer management system
• Optimized database queries, reducing API response time by 35% through indexing and query refactoring
• Collaborated with team of 6 developers using Agile methodology and Git version control
• Fixed 20+ production bugs and wrote comprehensive unit tests achieving 85% code coverage
• Participated in daily stand-ups, code reviews, and sprint planning meetings
• Implemented new feature for real-time notifications using WebSocket connections

Teaching Assistant | State University Computer Science Department | Fall 2023 - Present
• Assist professor in Introduction to Programming course with 120+ students
• Grade assignments and provide detailed feedback on code quality and logic
• Hold weekly office hours helping 15-20 students with debugging and algorithm problems
• Created interactive study guides and practice exercises improving student exam scores by 12%
• Mentor first-year students transitioning from basic programming to object-oriented concepts

PROJECTS
E-Commerce Platform | Personal Project | January 2024 - Present
• Built full-stack web application using React frontend and Node.js backend with TypeScript
• Implemented secure user authentication using JWT tokens and bcrypt password hashing
• Integrated Stripe payment processing API handling transactions securely
• Designed PostgreSQL database schema with proper normalization and relationships
• Deployed application using Docker containers on AWS EC2 with CI/CD pipeline
• Technologies: React, Node.js, PostgreSQL, Stripe API, Docker, AWS
• GitHub: github.com/alexchen/ecommerce-platform (150+ stars, 25+ forks)

Academic Database Management System | Course Project | Fall 2023
• Designed and implemented PostgreSQL database schema for student management system
• Created REST API endpoints using Express.js for CRUD operations with proper error handling
• Worked in team of 4 students using Git for version control and Agile methodology
• Implemented role-based access control for students, professors, and administrators
• Presented project to class of 50+ students receiving highest grade in class
• Technologies: Node.js, Express, PostgreSQL, JWT, React

LEADERSHIP & ACTIVITIES
Computer Science Club | Vice President | 2023 - Present
• Organize monthly coding workshops and hackathons with 50+ participants
• Mentor 10+ first-year students in programming fundamentals and career guidance
• Coordinate guest speaker events with industry professionals

Hackathon Winner | State University Hackathon 2024
• Led team of 3 to build mobile app for campus navigation using React Native
• Won "Best User Experience" award and $2,000 prize
• Implemented real-time location tracking and route optimization algorithms

Open Source Contributor | 2023 - Present
• Contributed to 5+ open source projects including React libraries
• Fixed bugs and added features to popular npm packages (500+ downloads/week)
• Maintained documentation and responded to GitHub issues
`;

export const mockInterviewResults = {
  interview: {
    id: "demo-interview-alex-chen-2025",
    conversationId: "demo-conversation-456",
    agentId: "agent_demo_software_engineer",
    transcript: `Interviewer: Can you tell me about yourself and your background?

Candidate: Hi! I'm Alexandra Chen, and I'm currently a senior computer science student at State University, graduating in May 2025. I've been passionate about software development since high school when I built my first web application. Over the past four years, I've completed an internship at TechCorp Solutions where I worked on full-stack development, and I've also been a teaching assistant for the Introduction to Programming course. My main focus has been on building scalable web applications using React and Node.js, and I've completed several projects including an e-commerce platform that I deployed on AWS. I'm really excited about this opportunity because I love solving complex technical problems and working in collaborative environments.

Interviewer: That's great! Can you tell me about a time when you had to work in a team to solve a difficult technical problem?

Candidate: Absolutely. During my internship at TechCorp last summer, we had a critical production issue where our customer management API was experiencing severe performance problems. The situation was that API response times had increased to over 5 seconds, causing customer complaints and system timeouts. My task was to work with a team of three other developers to identify and fix the root cause within 48 hours. I took action by first analyzing the database query execution plans and discovered that several frequently-used queries were missing proper indexes. I also found that we were making N+1 queries in a loop. I collaborated with the senior developer to review my findings, then I refactored the queries to use proper joins and added strategic indexes. I also implemented query result caching using Redis for frequently accessed data. As a result, we reduced the API response time from 5 seconds to under 300 milliseconds - that's a 94% improvement. The system stability improved significantly, and we received positive feedback from the product team. I learned a lot about database optimization and the importance of performance monitoring in production systems.

Interviewer: Excellent example! Now, can you explain what RESTful API design principles are and why they're important?

Candidate: RESTful API design follows a set of architectural principles that make web services more scalable, maintainable, and easier to work with. The key principles include using standard HTTP methods like GET for retrieving data, POST for creating resources, PUT or PATCH for updates, and DELETE for removal. Resources should be identified by URLs that represent nouns, not verbs - so instead of /getUser, you'd use /users/123. The API should be stateless, meaning each request contains all the information needed to process it without relying on server-side session state. Status codes should be used appropriately - 200 for success, 201 for created, 404 for not found, etc. REST APIs should also support different content types through HTTP headers, typically JSON for modern applications. These principles are important because they create a consistent, predictable interface that developers can easily understand and integrate with. They also enable better caching, scalability, and separation of concerns between client and server.

Interviewer: What would you do if you were assigned to work on a project using a technology stack you've never used before?

Candidate: I would start by doing thorough research on the technology - reading official documentation, watching tutorial videos, and understanding the core concepts and best practices. Then I'd set up a local development environment and create a small practice project to get hands-on experience with the basics. I'd also look for similar projects on GitHub to see real-world examples and patterns. I'd reach out to colleagues or the development community for guidance and ask specific questions about common pitfalls. I believe in learning by doing, so I'd break down the project into smaller tasks, starting with the simplest features first. I'd also make sure to write tests as I learn, which helps me understand the technology better. Throughout the process, I'd document what I'm learning and any challenges I encounter. I've actually done this before when I had to learn Docker for deploying my e-commerce project - I spent a weekend going through tutorials, then built a simple containerized app before applying it to the larger project. The key is being proactive, asking questions, and not being afraid to make mistakes while learning.

Interviewer: How do you handle tight deadlines or high-pressure situations in your work?

Candidate: When facing tight deadlines, my approach is to first assess the scope and break everything down into prioritized milestones. I communicate early and often with my team about what's feasible and any potential blockers. During my internship, we had a critical bug that needed to be fixed before a product launch. I quickly identified the root cause, created a minimal fix for immediate deployment, and then scheduled a more robust solution for the next sprint. I maintain constant communication about progress and make sure to maintain code quality even under pressure - I've learned that cutting corners usually leads to more problems later. I use project management tools to track progress and ensure nothing falls through the cracks. I also make sure to take short breaks to stay focused and avoid burnout. The key is staying organized, being transparent about challenges, and working efficiently without sacrificing quality.

Interviewer: What are you looking for in your next role, and why are you interested in this position?

Candidate: I'm looking for a role where I can grow as a developer while working on products that make a real impact. I'm particularly excited about opportunities where I can work with modern technologies, contribute to meaningful features, and learn from experienced developers through code reviews and pair programming. I want to join a team that values both technical excellence and collaboration. I'm eager to take on increasing responsibility, whether that's leading a feature, mentoring interns, or contributing to architectural decisions. Most importantly, I want to work somewhere that values continuous learning and gives me opportunities to explore new technologies and best practices. Based on what I've learned about this role, it seems like a perfect fit because it offers the kind of challenging problems I enjoy solving, uses technologies I'm passionate about, and has a culture of mentorship and growth that I'm looking for.`,
    durationSeconds: 540, // 9 minutes
    startedAt: new Date(Date.now() - 540000).toISOString(),
    endedAt: new Date().toISOString(),
    status: "completed",
    createdAt: new Date(Date.now() - 540000).toISOString(),
  },
  evaluation: {
    status: "complete",
    overallScore: 89,
    evaluation: {
      overall_score: 89,
      overall_strengths: [
        "Excellent use of STAR method in behavioral questions with specific metrics and clear outcomes",
        "Strong technical knowledge demonstrated through accurate explanations of REST API principles",
        "Shows proactive learning approach and adaptability to new technologies",
        "Clear alignment between resume experience and interview responses",
        "Demonstrates maturity in handling pressure and maintaining code quality"
      ],
      overall_improvements: [
        "Could provide more detail on collaboration aspects in team scenarios",
        "Consider discussing specific testing strategies and quality assurance practices",
        "Mention any experience with system design or architecture decisions"
      ],
      questions: [
        {
          question: "Can you tell me about yourself and your background?",
          answer: "Hi! I'm Alexandra Chen, and I'm currently a senior computer science student at State University, graduating in May 2025. I've been passionate about software development since high school when I built my first web application. Over the past four years, I've completed an internship at TechCorp Solutions where I worked on full-stack development, and I've also been a teaching assistant for the Introduction to Programming course. My main focus has been on building scalable web applications using React and Node.js, and I've completed several projects including an e-commerce platform that I deployed on AWS. I'm really excited about this opportunity because I love solving complex technical problems and working in collaborative environments.",
          score: 92,
          strengths: [
            "Clear, structured introduction with specific timeline",
            "Mentions relevant experience (internship, TA role) aligned with resume",
            "Highlights specific technologies and projects",
            "Expresses genuine enthusiasm and connects to role"
          ],
          improvements: [
            "Could mention specific achievements or metrics from projects",
            "Consider briefly mentioning what drew you to software development"
          ],
          question_type: "informational",
          improvement_quote: "I've completed several projects including an e-commerce platform",
        },
        {
          question: "Can you tell me about a time when you had to work in a team to solve a difficult technical problem?",
          answer: "Absolutely. During my internship at TechCorp last summer, we had a critical production issue where our customer management API was experiencing severe performance problems. The situation was that API response times had increased to over 5 seconds, causing customer complaints and system timeouts. My task was to work with a team of three other developers to identify and fix the root cause within 48 hours. I took action by first analyzing the database query execution plans and discovered that several frequently-used queries were missing proper indexes. I also found that we were making N+1 queries in a loop. I collaborated with the senior developer to review my findings, then I refactored the queries to use proper joins and added strategic indexes. I also implemented query result caching using Redis for frequently accessed data. As a result, we reduced the API response time from 5 seconds to under 300 milliseconds - that's a 94% improvement. The system stability improved significantly, and we received positive feedback from the product team. I learned a lot about database optimization and the importance of performance monitoring in production systems.",
          score: 95,
          strengths: [
            "Excellent STAR structure with clear Situation, Task, Action, and Result",
            "Provides specific metrics (5 seconds to 300ms, 94% improvement)",
            "Demonstrates technical depth (query optimization, indexing, caching)",
            "Shows collaboration and learning mindset",
            "Aligned with resume experience at TechCorp"
          ],
          improvements: [
            "Could mention more about team dynamics and how decisions were made",
            "Consider discussing what you would do differently if faced with similar situation"
          ],
          question_type: "behavioral",
          star_breakdown: { situation: "strong", task: "strong", action: "strong", result: "strong" },
        },
        {
          question: "Can you explain what RESTful API design principles are and why they're important?",
          answer: "RESTful API design follows a set of architectural principles that make web services more scalable, maintainable, and easier to work with. The key principles include using standard HTTP methods like GET for retrieving data, POST for creating resources, PUT or PATCH for updates, and DELETE for removal. Resources should be identified by URLs that represent nouns, not verbs - so instead of /getUser, you'd use /users/123. The API should be stateless, meaning each request contains all the information needed to process it without relying on server-side session state. Status codes should be used appropriately - 200 for success, 201 for created, 404 for not found, etc. REST APIs should also support different content types through HTTP headers, typically JSON for modern applications. These principles are important because they create a consistent, predictable interface that developers can easily understand and integrate with. They also enable better caching, scalability, and separation of concerns between client and server.",
          score: 93,
          strengths: [
            "Comprehensive explanation covering all major REST principles",
            "Provides concrete examples (HTTP methods, URL structure, status codes)",
            "Explains the 'why' behind the principles, not just the 'what'",
            "Demonstrates deep understanding of web architecture",
            "Shows practical knowledge applicable to real projects"
          ],
          improvements: [
            "Could mention versioning strategies for APIs",
            "Consider discussing HATEOAS or other advanced REST concepts"
          ],
          question_type: "technical",
        },
        {
          question: "What would you do if you were assigned to work on a project using a technology stack you've never used before?",
          answer: "I would start by doing thorough research on the technology - reading official documentation, watching tutorial videos, and understanding the core concepts and best practices. Then I'd set up a local development environment and create a small practice project to get hands-on experience with the basics. I'd also look for similar projects on GitHub to see real-world examples and patterns. I'd reach out to colleagues or the development community for guidance and ask specific questions about common pitfalls. I believe in learning by doing, so I'd break down the project into smaller tasks, starting with the simplest features first. I'd also make sure to write tests as I learn, which helps me understand the technology better. Throughout the process, I'd document what I'm learning and any challenges I encounter. I've actually done this before when I had to learn Docker for deploying my e-commerce project - I spent a weekend going through tutorials, then built a simple containerized app before applying it to the larger project. The key is being proactive, asking questions, and not being afraid to make mistakes while learning.",
          score: 88,
          strengths: [
            "Structured, logical approach to learning new technologies",
            "Provides specific example from past experience (Docker)",
            "Shows proactive learning mindset and resourcefulness",
            "Mentions practical strategies (documentation, tutorials, GitHub examples)",
            "Demonstrates coachability and growth mindset"
          ],
          improvements: [
            "Could mention how you prioritize which resources to use first",
            "Consider discussing how you measure your progress when learning"
          ],
          question_type: "situational",
        },
        {
          question: "How do you handle tight deadlines or high-pressure situations in your work?",
          answer: "When facing tight deadlines, my approach is to first assess the scope and break everything down into prioritized milestones. I communicate early and often with my team about what's feasible and any potential blockers. During my internship, we had a critical bug that needed to be fixed before a product launch. I quickly identified the root cause, created a minimal fix for immediate deployment, and then scheduled a more robust solution for the next sprint. I maintain constant communication about progress and make sure to maintain code quality even under pressure - I've learned that cutting corners usually leads to more problems later. I use project management tools to track progress and ensure nothing falls through the cracks. I also make sure to take short breaks to stay focused and avoid burnout. The key is staying organized, being transparent about challenges, and working efficiently without sacrificing quality.",
          score: 87,
          strengths: [
            "Provides specific example from internship experience",
            "Shows balanced approach (immediate fix + long-term solution)",
            "Emphasizes communication and transparency",
            "Demonstrates understanding of technical debt risks",
            "Mentions self-care and burnout prevention"
          ],
          improvements: [
            "Could provide more specific metrics on the bug fix timeline",
            "Consider discussing how you prioritize when multiple urgent tasks arise"
          ],
          question_type: "behavioral",
          star_breakdown: { situation: "strong", task: "strong", action: "strong", result: "weak" },
          improvement_quote: "I quickly identified the root cause",
        },
        {
          question: "What are you looking for in your next role, and why are you interested in this position?",
          answer: "I'm looking for a role where I can grow as a developer while working on products that make a real impact. I'm particularly excited about opportunities where I can work with modern technologies, contribute to meaningful features, and learn from experienced developers through code reviews and pair programming. I want to join a team that values both technical excellence and collaboration. I'm eager to take on increasing responsibility, whether that's leading a feature, mentoring interns, or contributing to architectural decisions. Most importantly, I want to work somewhere that values continuous learning and gives me opportunities to explore new technologies and best practices. Based on what I've learned about this role, it seems like a perfect fit because it offers the kind of challenging problems I enjoy solving, uses technologies I'm passionate about, and has a culture of mentorship and growth that I'm looking for.",
          score: 85,
          strengths: [
            "Shows genuine interest in growth and learning",
            "Mentions specific aspects of role (code reviews, pair programming)",
            "Expresses enthusiasm and connects personal goals to position",
            "Demonstrates research about the role and company"
          ],
          improvements: [
            "Could be more specific about what technologies or domains excite you",
            "Consider mentioning what type of impact you want to make",
            "Could express more passion and energy in delivery"
          ],
          question_type: "informational",
          improvement_quote: "I'm looking for a role where I can grow as a developer",
          sample_better_answer: "I'm looking for a role where I can deepen my expertise in React and Node.js while contributing to products that scale. Based on my internship at TechCorp where I optimized APIs and my e-commerce project on AWS, I'm particularly excited about full-stack roles that value both performance and user experience. I want to learn from senior engineers through code reviews and pair programming, and I'm eager to take on ownership of features. This role appeals to me because it uses the exact stack I've been building with, and the team's emphasis on mentorship aligns with how I learn best."
        }
      ]
    },
    error: null,
    createdAt: new Date(Date.now() - 300000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  metadata: {
    userId: "demo-user-alex-chen",
    userEmail: "alex.chen@stateuniversity.edu",
  },
};

/**
 * Business/non-technical demo for Marketing, Business Admin, etc.
 * Use ?demo=business&mock=true
 */
export const mockInterviewResultsBusiness = {
  interview: {
    id: "demo-interview-marcus-williams-2025",
    conversationId: "demo-conversation-business-789",
    agentId: "agent_demo_marketing_coordinator",
    transcript: `Interviewer: Can you tell me about yourself and your background?

Candidate: Hi! I'm Marcus Williams, a senior business administration major at State University, graduating in May 2025. I've been interested in marketing and brand strategy since I led a student organization's social media campaign in my sophomore year. I completed a marketing internship at RetailPlus last summer where I supported campaign planning and analyzed customer engagement data. I've also worked as a campus ambassador for a local startup, helping them grow their presence on campus. I'm excited about this opportunity because I love connecting brands with audiences and want to grow my skills in digital marketing and analytics.

Interviewer: Tell me about a time when you had to work with a difficult team member.

Candidate: During my internship, I worked with someone who often missed deadlines. The situation was stressful because our campaign launch was at risk. I scheduled a one-on-one to understand their workload and challenges. I offered to help break tasks into smaller steps and we set up weekly check-ins. As a result, they improved their delivery and we launched the campaign on time. I learned that communication and support often resolve conflict better than confrontation.

Interviewer: How would you measure the success of a marketing campaign?

Candidate: I'd look at key metrics like engagement rate, conversion rate, and ROI. Engagement would include likes, shares, comments, and time spent. Conversion would track how many people took the desired action—sign-ups, purchases, or downloads. ROI compares the revenue generated to the campaign cost. I'd also use A/B testing to see what messaging resonates. During my internship we used Google Analytics and social insights to track these.

Interviewer: What would you do if you had to present to a client with little notice?

Candidate: I'd first clarify the scope—what do they need to see and how much time do I have? Then I'd prioritize the most important points and create a simple deck. I'd lean on any existing materials or data we have. I'd practice my delivery once to stay within time. I've had to do this before when a teammate was sick—I presented our campaign results to a small group. It went well because I focused on clarity over perfection.

Interviewer: How do you prioritize when you have multiple deadlines?

Candidate: I list everything out and rank by urgency and impact. I communicate with stakeholders early about what's feasible. I use tools like Trello or a simple spreadsheet to track progress. During finals and my internship overlap, I blocked time for each priority and told my manager when I'd need flexibility. I also build in buffer time for unexpected issues.

Interviewer: Why are you interested in this role and our company?

Candidate: I'm looking for a role where I can apply my marketing experience and learn from seasoned professionals. I'm drawn to your focus on data-driven decision making and your company culture. I want to grow in campaign strategy and analytics while contributing to real projects. This role seems like a great fit because it aligns with my skills and offers the mentorship I'm looking for.`,
    durationSeconds: 420,
    startedAt: new Date(Date.now() - 420000).toISOString(),
    endedAt: new Date().toISOString(),
    status: "completed",
    createdAt: new Date(Date.now() - 420000).toISOString(),
  },
  evaluation: {
    status: "complete",
    overallScore: 84,
    evaluation: {
      overall_score: 84,
      overall_strengths: [
        "Strong communication and relationship-building skills",
        "Demonstrates data-driven thinking with marketing metrics",
        "Shows adaptability and professionalism under pressure",
        "Clear alignment between experience and career goals"
      ],
      overall_improvements: [
        "Add more specific metrics and outcomes where possible",
        "Consider discussing how you handle feedback and iteration",
        "Could expand on cross-functional collaboration examples"
      ],
      questions: [
        {
          question: "Can you tell me about yourself and your background?",
          answer: "Hi! I'm Marcus Williams, a senior business administration major at State University, graduating in May 2025. I've been interested in marketing and brand strategy since I led a student organization's social media campaign in my sophomore year. I completed a marketing internship at RetailPlus last summer where I supported campaign planning and analyzed customer engagement data. I've also worked as a campus ambassador for a local startup, helping them grow their presence on campus. I'm excited about this opportunity because I love connecting brands with audiences and want to grow my skills in digital marketing and analytics.",
          score: 88,
          strengths: [
            "Clear timeline and relevant experience",
            "Shows passion for marketing and brand work",
            "Mentions specific roles (internship, ambassador)",
            "Connects background to the role"
          ],
          improvements: [
            "Could add specific metrics from campaigns",
            "Consider mentioning what drew you to marketing initially"
          ],
          question_type: "informational",
          improvement_quote: "I've also worked as a campus ambassador",
        },
        {
          question: "Tell me about a time when you had to work with a difficult team member.",
          answer: "During my internship, I worked with someone who often missed deadlines. The situation was stressful because our campaign launch was at risk. I scheduled a one-on-one to understand their workload and challenges. I offered to help break tasks into smaller steps and we set up weekly check-ins. As a result, they improved their delivery and we launched the campaign on time. I learned that communication and support often resolve conflict better than confrontation.",
          score: 85,
          strengths: [
            "Uses STAR structure with clear Situation, Task, Action, Result",
            "Shows empathy and problem-solving approach",
            "Demonstrates outcome—campaign launched on time",
            "Reflects on learning"
          ],
          improvements: [
            "Could add more detail on the specific actions you took",
            "Consider quantifying the improvement (e.g., timeline)"
          ],
          question_type: "behavioral",
          star_breakdown: { situation: "strong", task: "strong", action: "strong", result: "strong" },
        },
        {
          question: "How would you measure the success of a marketing campaign?",
          answer: "I'd look at key metrics like engagement rate, conversion rate, and ROI. Engagement would include likes, shares, comments, and time spent. Conversion would track how many people took the desired action—sign-ups, purchases, or downloads. ROI compares the revenue generated to the campaign cost. I'd also use A/B testing to see what messaging resonates. During my internship we used Google Analytics and social insights to track these.",
          score: 86,
          strengths: [
            "Covers core marketing metrics (engagement, conversion, ROI)",
            "Provides concrete examples (Google Analytics)",
            "Mentions A/B testing as a method",
            "Ties to internship experience"
          ],
          improvements: [
            "Could mention specific benchmarks or targets",
            "Consider discussing how you report findings to stakeholders"
          ],
          question_type: "technical",
        },
        {
          question: "What would you do if you had to present to a client with little notice?",
          answer: "I'd first clarify the scope—what do they need to see and how much time do I have? Then I'd prioritize the most important points and create a simple deck. I'd lean on any existing materials or data we have. I'd practice my delivery once to stay within time. I've had to do this before when a teammate was sick—I presented our campaign results to a small group. It went well because I focused on clarity over perfection.",
          score: 82,
          strengths: [
            "Structured, logical approach",
            "Prioritizes clarity and preparation",
            "Uses specific past example",
            "Shows adaptability"
          ],
          improvements: [
            "Could add how you handle Q&A or curveballs",
            "Consider mentioning how you stay calm under pressure"
          ],
          question_type: "situational",
        },
        {
          question: "How do you prioritize when you have multiple deadlines?",
          answer: "I list everything out and rank by urgency and impact. I communicate with stakeholders early about what's feasible. I use tools like Trello or a simple spreadsheet to track progress. During finals and my internship overlap, I blocked time for each priority and told my manager when I'd need flexibility. I also build in buffer time for unexpected issues.",
          score: 83,
          strengths: [
            "Clear prioritization framework",
            "Mentions communication with stakeholders",
            "Uses specific tools (Trello)",
            "Shows real-world example (finals + internship)"
          ],
          improvements: [
            "Could provide a specific example of a trade-off you made",
            "Consider discussing how you say no when necessary"
          ],
          question_type: "behavioral",
          star_breakdown: { situation: "strong", task: "strong", action: "weak", result: "weak" },
          improvement_quote: "I list everything out and rank by urgency",
        },
        {
          question: "Why are you interested in this role and our company?",
          answer: "I'm looking for a role where I can apply my marketing experience and learn from seasoned professionals. I'm drawn to your focus on data-driven decision making and your company culture. I want to grow in campaign strategy and analytics while contributing to real projects. This role seems like a great fit because it aligns with my skills and offers the mentorship I'm looking for.",
          score: 78,
          strengths: [
            "Shows genuine interest in the company",
            "Mentions specific aspects (data-driven, culture)",
            "Connects skills to role",
            "Expresses desire for growth"
          ],
          improvements: [
            "Could be more specific about what excites you about the company",
            "Consider mentioning what type of impact you want to make",
            "Could express more energy and enthusiasm"
          ],
          question_type: "informational",
          improvement_quote: "I'm looking for a role where I can apply my marketing experience",
          sample_better_answer: "I'm excited about this role because it combines my marketing internship experience with my interest in data-driven analytics. I'm drawn to your company's focus on customer-centric campaigns and your commitment to mentorship. I want to deepen my skills in campaign strategy and learn how to measure ROI across channels. Based on what I've learned about this role, it seems like a perfect fit—I'd love to contribute to real projects while growing alongside your team. I'm particularly interested in the work you've done with [specific campaign or product] and would love to be part of that."
        }
      ]
    },
    error: null,
    createdAt: new Date(Date.now() - 300000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  metadata: {
    userId: "demo-user-marcus-williams",
    userEmail: "marcus.williams@stateuniversity.edu",
  },
};
