# AI Interview Coach — Technical Overview

This document serves two audiences: **investors and partners** who need clear, value-focused explanations of the product, and **developers** who need exact technical details on the stack and data flow.

---

## 1. Executive Summary

**Product:** AI Interview Coach is a voice-first practice platform designed specifically for **college students and internship seekers**.

**Value Proposition:** Real-time voice practice with an AI interviewer that adapts to your resume, followed by industry-standard **STAR method** scoring. Students speak naturally into their microphone; the AI asks tailored questions, listens, and responds in real time—then delivers per-question and overall scores with actionable strengths and improvements.

---

## 2. How It Works (The "Secret Sauce")

### The Voice Pipeline

- Uses **ElevenLabs Conversational AI** via WebSocket/Signed URL (SDK auto-upgrades to WebRTC when supported).
- Latency is optimized using **GLM-4.5-Air** for the agent's brain (fast, agentic reasoning).
- **Server-side VAD** (Voice Activity Detection) handles silence and interruptions—the AI detects when the user stops speaking and triggers its response.
- Audio streams client ↔ ElevenLabs directly; the backend only issues a short-lived signed URL and never touches the audio stream.

### Context Injection

- The AI reads the user's **Resume** (parsed text), **Major**, and **Academic Year** to tailor questions.
- Resume text is injected as `resume_summary` and `resume_highlights`; year as `year`, `technical_difficulty`, `technical_depth`, and `behavioral_ratio` via ElevenLabs dynamic variables.

### The Grading Engine

- Post-interview, the transcript is sent to **OpenAI GPT-4o-mini**.
- Uses a **Dynamic Rubric**: The system classifies each question (Behavioral, Technical, Situational, Informational) and applies different scoring weights.
- Behavioral answers are graded on **STAR method** (Situation-Task-Action-Result), Impact, Ownership, and Specificity; technical answers on Accuracy, Depth, and Relevance.

---

## 3. Technical Architecture (The Stack)

| Component | Technology | Details |
|-----------|------------|---------|
| **Frontend** | React + Vite | Tailwind CSS, Framer Motion (Orb Animation) |
| **Voice SDK** | @elevenlabs/react | `useConversation` hook with signed URL auth |
| **Backend** | Node.js / Express | Custom JWT Auth, Stateless API design |
| **Database** | PostgreSQL | Stores Profiles, Transcripts, and structured Evaluations |
| **AI Agent** | ElevenLabs | Powered by GLM-4.5-Air for low latency (~900ms) |
| **Evaluator** | OpenAI | Custom `openaiEvaluator.ts` script with adaptive prompts |

---

## 4. Critical User Flows

### The Interview

1. User logs in (**Auth Gate**).
2. Uploads Resume → Parsed text stored in Context.
3. Clicks "Start" → Connects to ElevenLabs Agent via Signed URL.
4. **Open-Ended Loop:** AI asks questions based on Resume/Major → User speaks → AI listens/responds.
5. Session ends (User clicks End or AI marks complete via `MarkInterviewComplete` tool).

### The Feedback

1. Transcript fetched from ElevenLabs API.
2. `scoreInterview` job runs asynchronously.
3. Dynamic Rubric applied to every Q&A pair.
4. Results (Score 0–100 + Strengths/Weaknesses) saved to DB and displayed on Results page.

---

## 5. Current Constraints & Roadmap

- **Audio:** We store text transcripts only (privacy/storage optimization). No audio blobs (S3/R2).
- **Mobile:** Mobile-responsive UI exists; full mobile audio support is in beta.
- **Role Specificity:** Currently derived from "Major"; dedicated Role Selector is on the immediate roadmap.
