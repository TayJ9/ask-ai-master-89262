# AI Interview Coach

## Overview

AI Interview Coach is a web application that helps users practice for job interviews through AI-powered mock interview sessions. The platform allows users to select their target role, participate in voice-based interview sessions, and receive detailed feedback on their performance. Users can track their progress over time through session history with scoring and personalized recommendations.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework & Build System**
- Built with React 18 using TypeScript for type safety
- Vite as the build tool and development server for fast hot module replacement
- React Router (Wouter) for lightweight client-side routing
- TanStack Query (React Query) for server state management and data fetching

**UI Component System**
- Radix UI primitives for accessible, unstyled component foundations
- shadcn/ui component library built on top of Radix UI
- Tailwind CSS for utility-first styling with custom design tokens
- Class Variance Authority (CVA) for managing component variants
- Custom design system with HSL color definitions for consistent theming

**State Management Approach**
- Server state managed via TanStack Query with built-in caching
- Local component state using React hooks
- Authentication state persisted in localStorage
- JWT tokens stored client-side for API authentication

**Key Frontend Features**
- Role-based interview preparation (Software Engineer, Product Manager, Marketing)
- Voice-based interview sessions with browser MediaRecorder API
- Real-time interview progress tracking
- Session history with performance analytics
- Form validation using Zod schemas and React Hook Form

### Backend Architecture

**Server Framework**
- Express.js server with TypeScript
- Vite middleware for development with SSR support
- Custom request/response logging middleware
- JSON body parsing with 50MB limit for handling audio uploads

**Authentication & Security**
- JWT-based authentication using jsonwebtoken library
- bcryptjs for password hashing with salt rounds
- Token-based API route protection via middleware
- Authorization headers required for protected endpoints

**API Design Pattern**
- RESTful API endpoints under `/api` prefix
- Authentication endpoints: `/api/auth/signup`, `/api/auth/login`
- Resource endpoints for sessions, questions, and responses
- Centralized error handling with proper HTTP status codes
- Request/response logging for API debugging

### Data Storage

**Database Solution**
- PostgreSQL database via Neon serverless platform
- Drizzle ORM for type-safe database queries
- WebSocket connection support for serverless PostgreSQL
- Connection pooling via @neondatabase/serverless

**Database Schema Design**
- `profiles`: User accounts with email, full name, and password hash
- `interview_questions`: Role-specific questions with category, difficulty, and ordering
- `interview_sessions`: Interview attempts with status tracking and overall scoring
- `interview_responses`: Individual question responses with detailed feedback
- UUID primary keys with automatic generation
- Foreign key relationships with cascade deletion
- Timestamps for auditing (createdAt, completedAt)

**ORM & Migrations**
- Drizzle Kit for schema management and migrations
- Type-safe schema definitions in `shared/schema.ts`
- Zod integration for runtime validation via drizzle-zod
- Push-based deployment strategy (`db:push` command)

### External Dependencies

**Third-Party Services**
- Neon Database: Serverless PostgreSQL hosting
- Browser APIs: MediaRecorder for audio capture, Web Speech API potential for voice processing

**Key NPM Packages**
- Authentication: bcryptjs, jsonwebtoken
- Database: @neondatabase/serverless, drizzle-orm, drizzle-kit
- UI Components: @radix-ui/* packages (20+ component primitives)
- Utilities: date-fns for date formatting, clsx/tailwind-merge for class management
- Development: tsx for TypeScript execution, vite for bundling

**Development Tooling**
- ESLint with TypeScript support for code quality
- TypeScript with strict mode disabled for flexibility
- React Hook Form with Zod resolvers for form validation
- Autoprefixer and PostCSS for CSS processing