# System Prompt Update - College Student Internship Focus

## ✅ Update Complete

The AI system prompt in `backend/voiceServer.js` has been comprehensively updated to specifically tailor interviews for college students preparing for their first internship or entry-level job.

## 🎯 Key Changes Implemented

### 1. ✅ Audience Recognition
- Explicitly recognizes candidates are college students preparing for FIRST internship/entry-level position
- Acknowledges LITTLE TO NO formal professional experience is EXPECTED and NORMAL
- Focuses on: academic projects, coursework, class assignments, transferable skills, GROWTH POTENTIAL
- Values non-traditional experience: volunteering, campus leadership, part-time jobs, student organizations

### 2. ✅ Tone & Approach
- WARM, ENCOURAGING, and CONFIDENCE-BUILDING tone
- Framed as a LEARNING OPPORTUNITY, not an interrogation
- Builds candidates up, doesn't intimidate or stress them
- Uses positive reinforcement and acknowledges efforts
- Offers implicit constructive feedback through encouraging follow-ups

### 3. ✅ Interview Structure
- Duration: 15-20 minutes (clearly specified)
- Structure: Warm greeting → Opening questions → Mixed questions → Closing → Encouragement
- Sets expectations that this is practice/preparation

### 4. ✅ Question Mix & Balance
- **Behavioral Questions (40-60%)**: 
  - Teamwork and collaboration
  - Adaptability and learning ability
  - Time management and organization
  - Communication skills
  - Problem-solving approach
  - Initiative and self-direction

- **Technical/Domain Questions (40-60%)**: Major-specific

### 5. ✅ Major-Specific Question Tailoring

#### Computer Science Majors
- Basic to intermediate programming concepts
- Algorithms, data structures
- Software development principles
- Debugging, version control
- Common languages (Python, Java, JavaScript)
- Object-oriented programming
- Basic system design
- **AVOIDS**: Finance, business, or non-CS technical questions

#### Finance Majors
- Financial principles, accounting basics
- Financial modeling concepts
- Market analysis, risk assessment
- Financial statements, investment basics
- Excel skills
- **AVOIDS**: Programming, algorithms, or non-finance technical questions

#### Engineering Majors
- Basic problem-solving, design principles
- Engineering fundamentals (mechanical/electrical/civil/etc.)
- Technical analysis, CAD tools
- Safety principles
- **AVOIDS**: Questions outside their engineering discipline

#### Business Majors
- Communication skills, market knowledge
- Basic analytics, leadership potential
- Business strategy basics
- Customer relations, project management basics
- **AVOIDS**: Deep technical programming or engineering questions

#### Psychology Majors
- Research methods, behavioral concepts
- Data analysis, experimental design
- Statistical concepts, psychological theories
- Applicable analytical skills
- **AVOIDS**: Programming, finance, or engineering-specific questions

#### General Majors
- Foundational questions appropriate for entry-level positions
- Basic concepts, transferable skills
- Learning approach

### 6. ✅ Dynamic Question Adjustment
- Adjusts technical depth based on responses
- Simplifies if struggling, goes deeper if excelling
- For less technical majors: 60-70% behavioral
- For technical majors: 50-50 or 60% technical, 40% behavioral

### 7. ✅ Question Framing
- Uses "Tell me about..." or "Can you share an example of..."
- Asks about academic projects: "What was your favorite project in [course]?"
- Invites non-traditional experience discussion
- Frames technical questions appropriately for coursework
- Makes questions conversational, not like a test

### 8. ✅ Response Handling
- Listens actively and asks personalized follow-ups
- References resume details, major, and previous responses
- Provides gentle guidance if struggling
- Acknowledges effort and learning, even if imperfect
- Builds on strengths rather than focusing on gaps

### 9. ✅ Conversation Flow
- Conversational and natural - helpful mentor, not stern examiner
- Clear, natural language suitable for voice conversation
- Allows natural pauses and thinking time
- Encourages elaboration
- Connects questions to previous responses

### 10. ✅ Memory & Personalization
- Remembers candidate's name throughout
- Remembers their major and keeps questions relevant
- References specific resume/background details
- Asks about their specific skills
- Adjusts expectations based on academic year

## 🧪 Verification Results

All major-specific prompts tested and verified:
- ✅ Computer Science: Has CS-specific questions, avoids finance
- ✅ Finance: Has Finance-specific questions, avoids programming
- ✅ Business: Has Business-specific questions, focuses on behavioral
- ✅ General: Uses appropriate general approach

All core requirements validated:
- ✅ Warm, encouraging tone
- ✅ 15-20 minute duration specified
- ✅ Focus on academic projects
- ✅ Behavioral questions included
- ✅ Major-specific questions
- ✅ Domain confusion avoidance
- ✅ Learning opportunity framing

## 📝 Implementation Details

**File Updated**: `backend/voiceServer.js`
**Function**: `createSystemPrompt(candidateContext)`
**Prompt Length**: ~5,600 characters
**Major Detection**: Automatic based on major field (case-insensitive)

## 🎯 Expected Behavior

When a candidate starts a voice interview:

1. **CS Major**: Gets programming,
2. **Finance Major**: Gets finance questions (NO programming)
3. **Business Major**: Gets business/behavioral questions (NO deep technical)
4. **Engineering Major**: Gets engineering-specific questions
5. **Psychology Major**: Gets psychology/research questions
6. **Other Majors**: Gets appropriate foundational questions

The AI will:
- Remember their major throughout
- Never ask domain-inappropriate questions
- Adjust difficulty dynamically
- Focus on growth potential
- Be warm and encouraging
- Frame as learning opportunity

## ✅ Status: COMPLETE

The system prompt is now fully tailored for college students preparing for internships, with clear major differentiation and appropriate question balance.

