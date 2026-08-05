/**
 * Full resume documents for portfolio demo candidates.
 * Structured for readable rendering in the expand viewer.
 */

import type { DemoResumeId } from "./demoResumes";

export interface DemoResumeDocumentEntry {
  title: string;
  subtitle?: string;
  dates?: string;
  bullets: string[];
}

export interface DemoResumeDocumentSection {
  title: string;
  paragraphs?: string[];
  entries?: DemoResumeDocumentEntry[];
  bullets?: string[];
}

export interface DemoResumeFullDocument {
  headline: string;
  contact: {
    email: string;
    phone: string;
    links: string[];
  };
  sections: DemoResumeDocumentSection[];
}

export const demoResumeDocuments: Record<DemoResumeId, DemoResumeFullDocument> = {
  tech: {
    headline: "Software Engineering Student",
    contact: {
      email: "alex.chen@stateuniversity.edu",
      phone: "(555) 234-5678",
      links: ["linkedin.com/in/alexandrachen", "github.com/alexchen"],
    },
    sections: [
      {
        title: "Education",
        entries: [
          {
            title: "Bachelor of Science in Computer Science",
            subtitle: "State University",
            dates: "Expected May 2025",
            bullets: [
              "GPA: 3.8/4.0 | Dean's List: Fall 2022, Spring 2023, Fall 2023",
              "Relevant coursework: Data Structures & Algorithms, Database Systems, Web Development, Software Engineering, Operating Systems, Computer Networks",
            ],
          },
        ],
      },
      {
        title: "Technical Skills",
        bullets: [
          "Languages: Python, JavaScript, TypeScript, Java, C++, SQL",
          "Frontend: React, Next.js, HTML5, CSS3, Tailwind CSS, Redux",
          "Backend: Node.js, Express.js, REST APIs, GraphQL",
          "Databases: PostgreSQL, MongoDB, Redis",
          "Tools: Git, Docker, AWS (EC2, S3), Jest, Postman, VS Code",
          "Methodologies: Agile/Scrum, Test-Driven Development, CI/CD",
        ],
      },
      {
        title: "Professional Experience",
        entries: [
          {
            title: "Software Development Intern",
            subtitle: "TechCorp Solutions",
            dates: "Summer 2024",
            bullets: [
              "Developed and maintained RESTful APIs using Node.js and Express for a customer management system",
              "Optimized database queries, reducing API response time by 35% through indexing and query refactoring",
              "Collaborated with a team of 6 developers using Agile methodology and Git version control",
              "Fixed 20+ production bugs and wrote unit tests achieving 85% code coverage",
              "Implemented real-time notifications using WebSocket connections",
            ],
          },
          {
            title: "Teaching Assistant",
            subtitle: "State University — Computer Science Department",
            dates: "Fall 2023 – Present",
            bullets: [
              "Assist professor in Introduction to Programming with 120+ students",
              "Grade assignments and provide feedback on code quality and logic",
              "Hold weekly office hours for 15–20 students on debugging and algorithms",
              "Created study guides and practice exercises that improved exam scores by 12%",
            ],
          },
        ],
      },
      {
        title: "Projects",
        entries: [
          {
            title: "E-Commerce Platform",
            subtitle: "Personal Project",
            dates: "Jan 2024 – Present",
            bullets: [
              "Full-stack app with React, Node.js, TypeScript, and PostgreSQL",
              "JWT authentication, bcrypt hashing, and Stripe payment integration",
              "Docker deployment on AWS EC2 with CI/CD pipeline",
              "GitHub: github.com/alexchen/ecommerce-platform (150+ stars, 25+ forks)",
            ],
          },
          {
            title: "Academic Database Management System",
            subtitle: "Course Project — Team of 4",
            dates: "Fall 2023",
            bullets: [
              "PostgreSQL schema design and Express REST API with role-based access control",
              "Highest grade in class; presented to 50+ students",
            ],
          },
        ],
      },
      {
        title: "Leadership & Activities",
        entries: [
          {
            title: "Computer Science Club — Vice President",
            dates: "2023 – Present",
            bullets: [
              "Organize monthly coding workshops and hackathons with 50+ participants",
              "Mentor first-year students and coordinate industry guest speakers",
            ],
          },
          {
            title: "Hackathon Winner — State University Hackathon 2024",
            bullets: [
              "Led team of 3; built campus navigation app with React Native",
              "Won Best User Experience award ($2,000 prize)",
            ],
          },
          {
            title: "Open Source Contributor",
            dates: "2023 – Present",
            bullets: [
              "Contributions to 5+ projects including popular React libraries",
              "Bug fixes and documentation for npm packages (500+ downloads/week)",
            ],
          },
        ],
      },
    ],
  },
  business: {
    headline: "Marketing & Brand Strategy Student",
    contact: {
      email: "marcus.williams@stateuniversity.edu",
      phone: "(555) 876-5432",
      links: ["linkedin.com/in/marcuswilliams"],
    },
    sections: [
      {
        title: "Education",
        entries: [
          {
            title: "Bachelor of Business Administration",
            subtitle: "State University — Concentration in Marketing",
            dates: "Expected May 2025",
            bullets: [
              "GPA: 3.6/4.0",
              "Relevant coursework: Marketing Management, Consumer Behavior, Digital Marketing, Business Analytics, Professional Selling, Organizational Behavior",
            ],
          },
        ],
      },
      {
        title: "Skills",
        bullets: [
          "Marketing: campaign planning, brand messaging, content calendars, social media strategy",
          "Analytics: Google Analytics, engagement metrics, conversion tracking, A/B testing, ROI analysis",
          "Tools: Canva, Meta Business Suite, Mailchimp, Excel, Google Sheets, Trello, PowerPoint",
          "Soft skills: presentation, cross-functional collaboration, stakeholder communication",
        ],
      },
      {
        title: "Professional Experience",
        entries: [
          {
            title: "Marketing Intern",
            subtitle: "RetailPlus",
            dates: "Summer 2024",
            bullets: [
              "Supported seasonal campaign planning for email and social channels",
              "Analyzed customer engagement data using Google Analytics and platform insights",
              "Assisted with A/B tests on ad copy and landing page layouts",
              "Prepared weekly performance summaries for the marketing manager",
              "Collaborated with design and e-commerce teams on campaign launch timelines",
            ],
          },
          {
            title: "Campus Brand Ambassador",
            subtitle: "Local startup — meal-planning app",
            dates: "2023 – Present",
            bullets: [
              "Grew on-campus awareness through tabling events, dorm flyers, and student org partnerships",
              "Collected product feedback from 40+ student users for the product team",
              "Increased app sign-ups by 28% during the fall semester activation push",
            ],
          },
        ],
      },
      {
        title: "Leadership & Campus Involvement",
        entries: [
          {
            title: "Social Media Lead",
            subtitle: "Business Students Association",
            dates: "Sophomore year",
            bullets: [
              "Led social media campaign that increased event attendance by 45%",
              "Created content calendar and coordinated with officers on brand voice",
            ],
          },
          {
            title: "Treasurer",
            subtitle: "Marketing Club",
            dates: "2023 – Present",
            bullets: [
              "Manage club budget and vendor relationships for speaker events",
              "Organize resume workshops and alumni networking nights",
            ],
          },
        ],
      },
      {
        title: "Projects & Coursework",
        entries: [
          {
            title: "Integrated Marketing Campaign — Course Capstone",
            dates: "Fall 2024",
            bullets: [
              "Developed full campaign for a fictional sustainable apparel brand",
              "Defined target personas, channel mix, KPIs, and 90-day content plan",
              "Presented final deck to class and guest marketing professional",
            ],
          },
        ],
      },
    ],
  },
  healthcare: {
    headline: "Bachelor of Science in Nursing (BSN) Candidate",
    contact: {
      email: "priya.patel@stateuniversity.edu",
      phone: "(555) 412-9087",
      links: ["linkedin.com/in/priyapatel-nursing"],
    },
    sections: [
      {
        title: "Education",
        entries: [
          {
            title: "Bachelor of Science in Nursing (BSN)",
            subtitle: "State University School of Nursing",
            dates: "Expected May 2026",
            bullets: [
              "GPA: 3.7/4.0 | Dean's List",
              "Coursework: Pharmacology, Pathophysiology, Health Assessment, Medical-Surgical Nursing, Pediatric Nursing, Community Health, Nursing Research",
            ],
          },
        ],
      },
      {
        title: "Certifications",
        bullets: [
          "Basic Life Support (BLS) — American Heart Association",
          "Advanced Cardiovascular Life Support (ACLS) — American Heart Association",
          "HIPAA training — current",
        ],
      },
      {
        title: "Clinical Experience",
        entries: [
          {
            title: "Medical-Surgical Rotation",
            subtitle: "Riverside Medical Center",
            dates: "Spring 2025",
            bullets: [
              "Cared for 4–5 patients per shift under RN supervision",
              "Performed assessments, medication administration, wound care, and patient education",
              "Documented in Epic EHR and participated in interdisciplinary rounds",
            ],
          },
          {
            title: "Pediatric Rotation",
            subtitle: "Riverside Medical Center — Children's Unit",
            dates: "Fall 2024",
            bullets: [
              "Supported families during admissions and discharge teaching",
              "Adapted communication for pediatric patients across age groups",
              "Assisted with pain management and comfort measures",
            ],
          },
        ],
      },
      {
        title: "Volunteer Experience",
        entries: [
          {
            title: "Patient Intake & Health Education Volunteer",
            subtitle: "Community Free Clinic",
            dates: "2023 – Present",
            bullets: [
              "Greet patients, verify intake forms, and escort to exam rooms",
              "Deliver health education materials on diabetes, hypertension, and preventive care",
              "Translate basic instructions for bilingual families when needed",
            ],
          },
          {
            title: "Health Fair Volunteer",
            subtitle: "County Public Health Department",
            dates: "Annual events",
            bullets: [
              "Screen vitals and refer attendees to clinic resources",
              "Helped anxious participants understand screening results in plain language",
            ],
          },
        ],
      },
      {
        title: "Campus & Professional Involvement",
        entries: [
          {
            title: "Member",
            subtitle: "Student Nurses Association",
            dates: "2023 – Present",
            bullets: [
              "Attend workshops on NCLEX prep and new graduate residency programs",
              "Volunteer for blood pressure screening events on campus",
            ],
          },
        ],
      },
    ],
  },
};
