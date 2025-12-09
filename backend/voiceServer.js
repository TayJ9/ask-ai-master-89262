// ============================================================================
// Voice Interview WebSocket Server
// ============================================================================
const WebSocket = require('ws');
const { resampleAudio, estimateSampleRate, isValidPCM16 } = require('./audioResampler');

const OPENAI_REALTIME_API_URL = 'wss://api.openai.com/v1/realtime';
const OPENAI_MODEL = 'gpt-4o-mini-realtime-preview-2024-12-17';
const PING_INTERVAL = 30000;

// ElevenLabs Conversational AI Configuration
const ELEVENLABS_API_URL = 'wss://api.elevenlabs.io/v1/convai/conversation';
const ELEVENLABS_AGENT_ID = 'agent_8601kavsezrheczradx9qmz8qp3e';
const ELEVENLABS_VOICE_ID = 'kdmDKE6EkgrWrrykO9Qt';
const ELEVENLABS_LLM = 'gpt-5.1';
const ELEVENLABS_SAMPLE_RATE = 16000; // ElevenLabs requires 16kHz PCM16 mono

function createSystemPrompt(candidateContext) {
  const { name, major, year, skills = [], experience, education, summary } = candidateContext;
  const skillsList = Array.isArray(skills) && skills.length > 0 ? skills.join(', ') : 'general skills';
  const experienceText = experience || 'limited professional experience';
  const educationText = education || 'their educational background';
  const summaryText = summary || 'their academic and personal background';

  // Determine major category for question tailoring
  const majorLower = (major || '').toLowerCase();
  let majorCategory = 'general';
  let technicalFocus = 'balanced';
  
  if (majorLower.includes('computer science') || majorLower.includes('cs ') || majorLower.includes('software') || majorLower.includes('programming')) {
    majorCategory = 'computer_science';
    technicalFocus = 'technical';
  } else if (majorLower.includes('finance') || majorLower.includes('accounting') || majorLower.includes('financial')) {
    majorCategory = 'finance';
    technicalFocus = 'domain_specific';
  } else if (majorLower.includes('engineering') || majorLower.includes('mechanical') || majorLower.includes('electrical') || majorLower.includes('civil')) {
    majorCategory = 'engineering';
    technicalFocus = 'technical';
  } else if (majorLower.includes('business') || majorLower.includes('management') || majorLower.includes('marketing')) {
    majorCategory = 'business';
    technicalFocus = 'behavioral';
  } else if (majorLower.includes('psychology') || majorLower.includes('psych')) {
    majorCategory = 'psychology';
    technicalFocus = 'domain_specific';
  }

  // Determine technical difficulty based on grade level
  const yearLower = (year || '').toLowerCase();
  let technicalDifficulty = 'moderate';
  let technicalDepth = 'intermediate';
  let behavioralRatio = 50; // Percentage of behavioral questions
  
  if (yearLower.includes('high school')) {
    technicalDifficulty = 'foundational';
    technicalDepth = 'basic';
    behavioralRatio = 70; // More behavioral, less technical
  } else if (yearLower.includes('freshman')) {
    technicalDifficulty = 'basic';
    technicalDepth = 'introductory';
    behavioralRatio = 65; // More behavioral
  } else if (yearLower.includes('sophomore')) {
    technicalDifficulty = 'basic-intermediate';
    technicalDepth = 'foundational';
    behavioralRatio = 60; // Slightly more behavioral
  } else if (yearLower.includes('junior')) {
    technicalDifficulty = 'intermediate';
    technicalDepth = 'moderate';
    behavioralRatio = 50; // Balanced
  } else if (yearLower.includes('senior')) {
    technicalDifficulty = 'intermediate-advanced';
    technicalDepth = 'advanced';
    behavioralRatio = 45; // More technical
  } else if (yearLower.includes('post grad') || yearLower.includes('postgrad') || yearLower.includes('graduate')) {
    technicalDifficulty = 'advanced';
    technicalDepth = 'expert';
    behavioralRatio = 40; // Most technical
  }

  return `You are a warm, encouraging, and supportive AI interviewer conducting an internship/entry-level job interview for ${name || 'a college student'}.

CANDIDATE INFORMATION:
- Name: ${name || 'Not provided'}
- Major/Field: ${major || 'Not specified'}
- Academic Year: ${year || 'Not specified'}
- Skills: ${skillsList}
- Experience: ${experienceText}
- Education: ${educationText}
- Summary: ${summaryText}

CORE INTERVIEW PRINCIPLES:

1. AUDIENCE RECOGNITION:
   - This candidate is a college student preparing for their FIRST internship or entry-level position
   - Many candidates have LITTLE TO NO formal professional experience - this is EXPECTED and NORMAL
   - Focus on: academic projects, coursework, class assignments, transferable skills, and GROWTH POTENTIAL
   - Value non-traditional experience: volunteering, campus leadership, part-time jobs, student organizations, personal projects
   - Frame questions to highlight what they CAN do, not what they haven't done yet

2. TONE & APPROACH:
   - Be WARM, ENCOURAGING, and CONFIDENCE-BUILDING
   - This is a LEARNING OPPORTUNITY, not an interrogation
   - Build them up, don't intimidate or stress them
   - Use positive reinforcement and acknowledge their efforts
   - Make them feel valued and heard throughout the conversation
   - Offer implicit constructive feedback through encouraging follow-ups

3. INTERVIEW STRUCTURE (15-20 minutes):
   - Start: Warm greeting, brief introduction, set expectations (this is practice/preparation)
   - Opening: Ask about their interest in ${major || 'their field'} and what drew them to it
   - Middle: Mix of behavioral and technical questions (see question guidelines below)
   - Closing: Discuss career goals, internship interests, and next steps
   - End: Thank them warmly and offer encouragement

4. QUESTION MIX & BALANCE:
   - BEHAVIORAL QUESTIONS (${100 - behavioralRatio}%): Focus on soft skills critical for entry-level roles:
     * Teamwork and collaboration (group projects, study groups)
     * Adaptability and learning ability (handling new challenges, learning from mistakes)
     * Time management and organization (balancing coursework, activities)
     * Communication skills (presentations, group discussions)
     * Problem-solving approach (academic challenges, personal projects)
     * Initiative and self-direction (independent learning, personal projects)
   
   - TECHNICAL/DOMAIN QUESTIONS (${behavioralRatio}%): Tailored EXCLUSIVELY to their major and academic level (${year || 'their level'}):
     * Technical Difficulty Level: ${technicalDifficulty} (${technicalDepth} depth)
     * Adjust complexity based on their grade level - ${yearLower.includes('high school') || yearLower.includes('freshman') ? 'focus on foundational concepts and learning potential' : yearLower.includes('post grad') || yearLower.includes('graduate') ? 'expect deeper technical knowledge and real-world application' : 'balance foundational and intermediate concepts'}
${majorCategory === 'computer_science' ? `     * Computer Science: ${technicalDifficulty === 'foundational' || technicalDifficulty === 'basic' ? 'Basic programming concepts, simple algorithms, fundamental data structures (arrays, lists), basic syntax, introductory programming languages, simple problem-solving' : technicalDifficulty === 'intermediate' || technicalDifficulty === 'intermediate-advanced' ? 'Intermediate programming concepts, algorithms and data structures (trees, graphs, hash tables), software development principles, debugging techniques, version control (Git), object-oriented programming, design patterns, basic system design, testing' : 'Advanced algorithms and data structures, complex system design, software architecture, design patterns, performance optimization, concurrency, distributed systems, advanced debugging, production-level code practices'} - adjust depth based on ${year || 'their academic level'}
     * AVOID: Finance, business, or non-CS technical questions` : ''}
${majorCategory === 'finance' ? `     * Finance: ${technicalDifficulty === 'foundational' || technicalDifficulty === 'basic' ? 'Basic financial principles, introductory accounting concepts, simple financial statements, basic Excel skills, fundamental market concepts' : technicalDifficulty === 'intermediate' || technicalDifficulty === 'intermediate-advanced' ? 'Financial principles, accounting fundamentals, financial modeling concepts, market analysis, risk assessment, financial statements analysis, investment basics, advanced Excel skills, financial ratios' : 'Advanced financial modeling, complex risk assessment, portfolio management, derivatives, advanced financial analysis, quantitative finance, financial software tools'} - adjust depth based on ${year || 'their academic level'}
     * AVOID: Programming, algorithms, or non-finance technical questions` : ''}
${majorCategory === 'engineering' ? `     * Engineering: ${technicalDifficulty === 'foundational' || technicalDifficulty === 'basic' ? 'Basic problem-solving, fundamental engineering concepts, introductory design principles, basic technical analysis, simple CAD or relevant tools, safety basics' : technicalDifficulty === 'intermediate' || technicalDifficulty === 'intermediate-advanced' ? 'Engineering problem-solving, design principles, engineering fundamentals relevant to their discipline (mechanical/electrical/civil/etc.), technical analysis, CAD or relevant tools, safety principles, project management basics' : 'Advanced engineering problem-solving, complex design principles, advanced technical analysis, advanced CAD/tools, systems engineering, optimization, advanced safety protocols, project management'} - adjust depth based on ${year || 'their academic level'}
     * AVOID: Questions outside their engineering discipline or unrelated technical domains` : ''}
${majorCategory === 'business' ? `     * Business: ${technicalDifficulty === 'foundational' || technicalDifficulty === 'basic' ? 'Basic communication skills, introductory market concepts, simple analytics, leadership basics, fundamental business concepts, customer interaction basics' : technicalDifficulty === 'intermediate' || technicalDifficulty === 'intermediate-advanced' ? 'Communication skills, market knowledge, basic analytics, leadership potential, business strategy basics, customer relations, project management basics, business analysis' : 'Advanced business strategy, complex analytics, strategic leadership, advanced market analysis, business intelligence, advanced project management, organizational behavior'} - adjust depth based on ${year || 'their academic level'}
     * AVOID: Deep technical programming or engineering questions` : ''}
${majorCategory === 'psychology' ? `     * Psychology: ${technicalDifficulty === 'foundational' || technicalDifficulty === 'basic' ? 'Basic research methods, introductory behavioral concepts, simple data analysis, basic experimental design, fundamental statistical concepts, core psychological theories' : technicalDifficulty === 'intermediate' || technicalDifficulty === 'intermediate-advanced' ? 'Research methods, behavioral concepts, data analysis, experimental design, statistical concepts, psychological theories, applicable analytical skills, research ethics' : 'Advanced research methods, complex behavioral analysis, advanced statistical methods, sophisticated experimental design, advanced psychological theories, research publication, advanced analytical techniques'} - adjust depth based on ${year || 'their academic level'}
     * AVOID: Programming, finance, or engineering-specific questions` : ''}
${majorCategory === 'general' ? `     * General: Foundational questions appropriate for entry-level positions in ${major || 'their field'}, basic concepts, transferable skills, learning approach` : ''}

5. MAJOR-SPECIFIC GUIDELINES:
   - REMEMBER their major throughout the conversation: ${major || 'their field'}
   - REMEMBER their academic level: ${year || 'their level'} - this determines technical difficulty
   - NEVER ask questions outside their domain expertise (e.g., don't ask CS majors about finance, don't ask finance majors about programming)
   - Adjust technical depth based on their academic level:
     * High School/Freshman: Focus on foundational concepts, learning potential, and basic understanding
     * Sophomore/Junior: Balance foundational and intermediate concepts, expect some depth
     * Senior/Post Grad: Expect deeper technical knowledge, real-world application, and advanced concepts
   - Adjust technical depth based on their responses - if they struggle, simplify; if they excel, go deeper (but stay within bounds of their academic level)
   - For less technical majors, lean MORE heavily on behavioral questions (60-70% behavioral)
   - For technical majors, maintain balance based on academic level: ${yearLower.includes('high school') || yearLower.includes('freshman') ? 'more behavioral (65-70%)' : yearLower.includes('post grad') || yearLower.includes('graduate') ? 'more technical (60% technical, 40% behavioral)' : 'balanced (50-50)'}

6. QUESTION FRAMING:
   - Use "Tell me about..." or "Can you share an example of..." rather than "Explain..."
   - Ask about academic projects: "What was your favorite project in [course]?" or "Tell me about a challenging assignment you worked on"
   - Invite discussion of non-traditional experience: "Have you been involved in any clubs, volunteer work, or part-time jobs?"
   - Frame technical questions appropriately: "In your [major] coursework, have you learned about [concept]?"
   - Make questions feel conversational, not like a test

7. RESPONSE HANDLING:
   - Listen actively and ask personalized follow-up questions based on their answers
   - Reference their resume details, major, and previous responses throughout
   - If they mention a project or experience, ask follow-ups about it
   - If they struggle with a question, provide gentle guidance or reframe it
   - Acknowledge effort and learning, even if answers aren't perfect
   - Build on their strengths rather than focusing on gaps

8. DYNAMIC ADJUSTMENT:
   - Start with questions appropriate for ${year || 'their academic level'} (${technicalDifficulty} difficulty)
   - Adjust difficulty based on responses: easier if struggling, more challenging if excelling
   - However, respect their academic level: ${yearLower.includes('high school') || yearLower.includes('freshman') ? 'don\'t push too far beyond foundational concepts even if they excel' : yearLower.includes('post grad') || yearLower.includes('graduate') ? 'expect deeper knowledge and can challenge with advanced concepts' : 'can explore intermediate to advanced concepts if they demonstrate strong understanding'}
   - If they have strong technical background for their level, include more technical depth within appropriate bounds
   - If they're newer to the field, focus more on potential and learning ability
   - Balance is key - don't overwhelm, but don't undersell their capabilities
   - Remember: ${year || 'their level'} sets the baseline - adjust from there based on their responses

9. CONVERSATION FLOW:
   - Be conversational and natural - this should feel like a helpful mentor, not a stern examiner
   - Use clear, natural language suitable for voice conversation
   - Allow natural pauses and thinking time
   - Encourage elaboration: "That's interesting, tell me more about..."
   - Connect questions: "Building on what you just said about [topic]..."

10. REMEMBER THROUGHOUT:
   - Candidate's name: ${name || 'use their name when appropriate'}
   - Their major: ${major || 'their field'} - keep questions relevant
   - Their background: ${summaryText} - reference specific details
   - Their skills: ${skillsList} - ask about these specifically
   - Their academic level: ${year || 'their level'} (${technicalDifficulty} technical difficulty, ${technicalDepth} depth) - adjust expectations and question complexity accordingly

REMEMBER: Your goal is to help them PREPARE for real interviews while assessing their potential. Make this a positive, confidence-building experience that helps them learn and grow. Be their advocate, not their critic.`;
}

// Map year string to grade level format for ElevenLabs
function mapYearToGradeLevel(year) {
  if (!year) return 'Not specified';
  const yearLower = year.toLowerCase();
  
  if (yearLower.includes('high school')) return 'High School';
  if (yearLower.includes('freshman')) return 'Freshman';
  if (yearLower.includes('sophomore')) return 'Sophomore';
  if (yearLower.includes('junior')) return 'Junior';
  if (yearLower.includes('senior')) return 'Senior';
  if (yearLower.includes('post grad') || yearLower.includes('postgrad') || yearLower.includes('graduate')) return 'Graduate';
  
  return year; // Return as-is if no match
}

// Infer target role from major
function inferTargetRole(major) {
  if (!major) return 'Entry-level Professional';
  const majorLower = major.toLowerCase();
  
  if (majorLower.includes('computer science') || majorLower.includes('cs ') || majorLower.includes('software') || majorLower.includes('programming')) {
    return 'Software Engineer';
  }
  if (majorLower.includes('finance') || majorLower.includes('accounting') || majorLower.includes('financial')) {
    return 'Financial Analyst';
  }
  if (majorLower.includes('engineering')) {
    if (majorLower.includes('mechanical')) return 'Mechanical Engineer';
    if (majorLower.includes('electrical')) return 'Electrical Engineer';
    if (majorLower.includes('civil')) return 'Civil Engineer';
    return 'Engineer';
  }
  if (majorLower.includes('business') || majorLower.includes('management') || majorLower.includes('marketing')) {
    return 'Business Analyst';
  }
  if (majorLower.includes('psychology') || majorLower.includes('psych')) {
    return 'Psychology Professional';
  }
  
  return 'Entry-level Professional'; // Default fallback
}

// Map candidate context to ElevenLabs format
function mapCandidateContextToElevenLabs(candidateContext) {
  const { summary, experience, major, year } = candidateContext;
  
  // Combine summary and experience for resume field
  const resume = summary || experience || '';
  
  return {
    resume: resume,
    major: major || '',
    grade_level: mapYearToGradeLevel(year),
    target_role: inferTargetRole(major)
  };
}

function createOpenAIConnection(apiKey, systemPrompt) {
  return new Promise((resolve, reject) => {
    console.log('🔌 Connecting to OpenAI Realtime API...');
    
    // Validate API key format
    if (!apiKey || typeof apiKey !== 'string') {
      const error = new Error('OPENAI_API_KEY is not set or invalid');
      console.error('❌', error.message);
      reject(error);
      return;
    }
    
    // Check API key format (should start with sk-)
    if (!apiKey.startsWith('sk-')) {
      const error = new Error('OPENAI_API_KEY format is invalid. API keys should start with "sk-"');
      console.error('❌', error.message);
      console.error('❌ API key starts with:', apiKey.substring(0, 10) + '...');
      reject(error);
      return;
    }
    
    // Log masked API key for debugging (first 7 chars + last 4 chars)
    const maskedKey = apiKey.length > 11 
      ? `${apiKey.substring(0, 7)}...${apiKey.substring(apiKey.length - 4)}`
      : '***';
    console.log('🔑 Using API key:', maskedKey);
    
    // Add connection timeout
    const connectionTimeout = setTimeout(() => {
      console.error('⏱️ OpenAI connection timeout after 10 seconds');
      reject(new Error('OpenAI connection timeout - server did not respond'));
    }, 10000);
    
    const ws = new WebSocket(`${OPENAI_REALTIME_API_URL}?model=${OPENAI_MODEL}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'OpenAI-Beta': 'realtime=v1'
      }
    });
    
    ws.on('open', () => {
      console.log('✓ Connected to OpenAI Realtime API');
      console.log('✓ Using OpenAI model:', OPENAI_MODEL);
      clearTimeout(connectionTimeout);
      
      const configMessage = {
        type: 'session.update',
        session: {
          modalities: ['text', 'audio'],
          instructions: systemPrompt,
          voice: 'cedar',
          input_audio_format: 'pcm16',
          output_audio_format: 'pcm16',
          turn_detection: {
            type: 'server_vad',
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 2500  // Increased to 2.5 seconds - AI should wait for user response
          },
          temperature: 0.8,
          max_response_output_tokens: 4096
        }
      };
      
      ws.send(JSON.stringify(configMessage));
      console.log('✓ Session configuration sent to OpenAI');
      console.log('📋 Session Configuration:');
      console.log('   Model:', OPENAI_MODEL);
      console.log('   Voice:', configMessage.session.voice);
      console.log('   Input Audio Format:', configMessage.session.input_audio_format);
      console.log('   Output Audio Format:', configMessage.session.output_audio_format);
      console.log('   Turn Detection:', JSON.stringify(configMessage.session.turn_detection));
      console.log('   Temperature:', configMessage.session.temperature);
      // Resolve immediately - we'll handle session.updated in the main handler
      resolve(ws);
    });
    
    ws.on('error', (error) => {
      console.error('❌ OpenAI WebSocket error:', error);
      clearTimeout(connectionTimeout);
      reject(error);
    });
    
    ws.on('close', (code, reason) => {
      console.log(`✓ OpenAI WebSocket closed: ${code} - ${reason.toString()}`);
      clearTimeout(connectionTimeout);
    });
  });
}

function createElevenLabsConnection(apiKey, candidateContext) {
  return new Promise((resolve, reject) => {
    console.log('🔌 Connecting to ElevenLabs Conversational AI...');
    
    // Validate API key format
    if (!apiKey || typeof apiKey !== 'string') {
      const error = new Error('ELEVENLABS_API_KEY is not set or invalid');
      console.error('❌', error.message);
      reject(error);
      return;
    }
    
    // Log masked API key for debugging
    const maskedKey = apiKey.length > 11 
      ? `${apiKey.substring(0, 7)}...${apiKey.substring(apiKey.length - 4)}`
      : '***';
    console.log('🔑 Using ElevenLabs API key:', maskedKey);
    
    // Map candidate context to ElevenLabs format
    const elevenLabsContext = mapCandidateContextToElevenLabs(candidateContext);
    console.log('📋 ElevenLabs Context Variables:');
    console.log('   Resume:', elevenLabsContext.resume.substring(0, 100) + '...');
    console.log('   Major:', elevenLabsContext.major);
    console.log('   Grade Level:', elevenLabsContext.grade_level);
    console.log('   Target Role:', elevenLabsContext.target_role);
    
    // Add connection timeout
    const connectionTimeout = setTimeout(() => {
      console.error('⏱️ ElevenLabs connection timeout after 10 seconds');
      reject(new Error('ElevenLabs connection timeout - server did not respond'));
    }, 10000);
    
    // Build WebSocket URL with agent ID and FORCE PCM16 output format
    // CRITICAL: Explicitly set output_format=pcm_16000 to prevent MP3 default
    const wsUrl = `${ELEVENLABS_API_URL}?agent_id=${ELEVENLABS_AGENT_ID}&output_format=pcm_16000`;
    
    // Log the complete URL configuration (masking API key for security)
    const maskedUrl = wsUrl.replace(apiKey.substring(0, 7), '***');
    console.log('🔗 ElevenLabs WebSocket URL Configuration:');
    console.log('   Full URL:', maskedUrl);
    console.log('   Base URL:', ELEVENLABS_API_URL);
    console.log('   Agent ID:', ELEVENLABS_AGENT_ID);
    console.log('   Output Format Parameter: output_format=pcm_16000');
    console.log('   ⚠️  CRITICAL: This forces PCM16 output (not MP3)');
    
    const ws = new WebSocket(wsUrl, {
      headers: {
        'xi-api-key': apiKey
      }
    });
    
    ws.on('open', () => {
      console.log('✓ Connected to ElevenLabs Conversational AI');
      console.log('✓ Using Agent ID:', ELEVENLABS_AGENT_ID);
      console.log('✓ Using Voice ID:', ELEVENLABS_VOICE_ID);
      console.log('✓ Using LLM:', ELEVENLABS_LLM);
      clearTimeout(connectionTimeout);
      
      // Initialize conversation with context variables
      // CRITICAL: Explicitly set output format to pcm_16000 to prevent MP3 default
      // Format is specified in both URL parameter AND conversation_init message for maximum compatibility
      const initMessage = {
        type: 'conversation_init',
        agent_id: ELEVENLABS_AGENT_ID,
        voice_id: ELEVENLABS_VOICE_ID,
        llm: ELEVENLABS_LLM,
        input_audio_format: {
          sample_rate: ELEVENLABS_SAMPLE_RATE, // ElevenLabs requires 16kHz PCM16 mono
          encoding: 'pcm16',
          channels: 1 // Mono
        },
        // CRITICAL: Force PCM16 output format (not MP3)
        // Using string format "pcm_16000" as specified in ElevenLabs documentation
        // This MUST be set explicitly to prevent SDK defaulting to MP3
        // Format is specified in both URL parameter AND conversation_init message for maximum compatibility
        output_format: 'pcm_16000', // Explicitly request PCM16 16000Hz output (prevents MP3 default)
        // Also specify output_audio_format object for compatibility
        output_audio_format: {
          sample_rate: ELEVENLABS_SAMPLE_RATE, // Force 16kHz output
          encoding: 'pcm16', // Force PCM16 (not MP3)
          channels: 1 // Mono
        },
        context: {
          resume: elevenLabsContext.resume,
          major: elevenLabsContext.major,
          grade_level: elevenLabsContext.grade_level,
          target_role: elevenLabsContext.target_role
        }
      };
      
      // Log the exact message being sent for verification
      const initMessageJson = JSON.stringify(initMessage, null, 2);
      console.log('✓ Conversation initialization message prepared');
      console.log('📋 ElevenLabs Configuration:');
      console.log('   Agent ID:', ELEVENLABS_AGENT_ID);
      console.log('   Voice ID:', ELEVENLABS_VOICE_ID);
      console.log('   LLM:', ELEVENLABS_LLM);
      console.log('   WebSocket URL parameter: &output_format=pcm_16000');
      console.log('   Input Audio Format: 16kHz PCM16 mono');
      console.log('   Output Format (string): pcm_16000');
      console.log('   Output Audio Format (object): 16kHz PCM16 mono');
      console.log('   Full conversation_init message:');
      console.log(initMessageJson);
      
      ws.send(initMessageJson);
      console.log('✅ Conversation initialization sent to ElevenLabs');
      console.log('');
      console.log('💡 ElevenLabs Settings to Check (if experiencing static/audio issues):');
      console.log('   1. Voice Settings (in ElevenLabs dashboard):');
      console.log('      - Voice Stability: Should be 0.5-0.75 (too high = robotic, too low = unstable)');
      console.log('      - Similarity Boost: Should be 0.5-0.75 (too high = over-processed)');
      console.log('      - Style: Should be moderate (0.0-0.5) to avoid artifacts');
      console.log('   2. Conversational AI Agent Settings:');
      console.log('      - Output Audio Format: Must be 16kHz PCM16 mono');
      console.log('      - Audio Quality: Should be "high" or "ultra" (not "low")');
      console.log('      - Streaming Settings: Ensure streaming is enabled properly');
      console.log('   3. Model Settings:');
      console.log('      - LLM Model: Verify', ELEVENLABS_LLM, 'is correct and available');
      console.log('      - Temperature: Should be moderate (0.7-0.9) for natural speech');
      
      // Resolve immediately - we'll handle conversation events in the main handler
      resolve(ws);
    });
    
    ws.on('error', (error) => {
      console.error('❌ ElevenLabs WebSocket error:', error);
      clearTimeout(connectionTimeout);
      reject(error);
    });
    
    ws.on('close', (code, reason) => {
      console.log(`✓ ElevenLabs WebSocket closed: ${code} - ${reason.toString()}`);
      clearTimeout(connectionTimeout);
    });
  });
}

function handleFrontendConnection(frontendWs, httpServer) {
  console.log('🎯 ========================================');
  console.log('🎯 NEW FRONTEND WEBSOCKET CONNECTION');
  console.log('🎯 ========================================');
  console.log('🎯 WebSocket readyState:', frontendWs.readyState === WebSocket.OPEN ? 'OPEN' : 'CONNECTING');
  console.log('🎯 Timestamp:', new Date().toISOString());
  
  let openAIWs = null;
  let elevenLabsWs = null;
  let candidateContext = null;
  let pingInterval = null;
  let isInterviewActive = false;
  let currentProvider = null; // 'elevenlabs' or 'openai'
  
  // Set up ping/pong for connection health
  pingInterval = setInterval(() => {
    if (frontendWs.readyState === WebSocket.OPEN) {
      frontendWs.ping();
      console.log('📡 Sent ping to frontend');
    } else {
      console.log('⚠️  Cannot ping - WebSocket not open, state:', frontendWs.readyState);
    }
  }, PING_INTERVAL);
  
  frontendWs.on('pong', () => {
    console.log('📡 ✅ Received pong from frontend - connection healthy');
  });
  
  // Log connection open event
  frontendWs.on('open', () => {
    console.log('🎯 ✅ Frontend WebSocket OPEN event fired');
  });
  
  // CRITICAL: Set up message handler IMMEDIATELY after connection
  console.log('🎯 Setting up message handler for frontend WebSocket...');
  
  frontendWs.on('message', async (data) => {
    console.log('📥 RAW MESSAGE RECEIVED - Data type:', typeof data, 'Is Buffer:', data instanceof Buffer, 'Length:', data.length || (data.toString ? data.toString().length : 'unknown'));
    
    try {
      // CRITICAL: WebSocket messages in Node.js ws library come as Buffers
      // even when they're JSON strings! We need to check the content, not just the type.
      const rawData = data instanceof Buffer ? data.toString('utf8') : data.toString();
      
      // Check if it's JSON by trying to parse it
      let isJSON = false;
      let message = null;
      
      try {
        // Try to parse as JSON first
        message = JSON.parse(rawData);
        isJSON = true;
        console.log('✅ Message is JSON format');
      } catch (parseError) {
        // Not JSON - treat as binary audio data
        isJSON = false;
        console.log('🎵 Message is binary audio data (not JSON)');
      }
      
      // Handle binary audio data (not JSON)
      if (!isJSON) {
        const audioLength = data instanceof Buffer ? data.length : rawData.length;
        console.log('🎵 Processing binary audio data, length:', audioLength);
        
        // Forward to ElevenLabs if active
        if (elevenLabsWs && elevenLabsWs.readyState === WebSocket.OPEN && isInterviewActive && currentProvider === 'elevenlabs') {
          try {
            // Convert to buffer
            const audioBuffer = data instanceof Buffer ? data : Buffer.from(rawData);
            
            // Validate PCM16 format
            if (!isValidPCM16(audioBuffer)) {
              console.error('❌ Invalid PCM16 binary audio format: buffer length must be multiple of 2');
              return;
            }
            
            // Estimate sample rate (binary data doesn't include metadata)
            // Default to 48kHz (most common browser rate) if unknown
            const estimatedSampleRate = estimateSampleRate(audioBuffer);
            console.log(`[AUDIO-RESAMPLE] Binary audio detected: ${audioBuffer.length} bytes, estimated ${estimatedSampleRate}Hz`);
            
            // Resample to 16kHz if needed
            let finalBuffer;
            if (estimatedSampleRate === ELEVENLABS_SAMPLE_RATE) {
              console.log(`[AUDIO-RESAMPLE] ✅ Binary audio already at ${ELEVENLABS_SAMPLE_RATE}Hz - no resampling needed`);
              finalBuffer = audioBuffer;
            } else {
              console.log(`[AUDIO-RESAMPLE] 🔄 Resampling binary audio ${estimatedSampleRate}Hz → ${ELEVENLABS_SAMPLE_RATE}Hz`);
              // Note: Binary audio format is assumed to be mono (1 channel)
              // If stereo binary audio is received, it will be incorrectly processed
              // This is acceptable as ElevenLabs expects mono input
              const resampleResult = resampleAudio(
                audioBuffer,
                estimatedSampleRate,
                ELEVENLABS_SAMPLE_RATE,
                1, // Assume mono for binary data
                { logDetails: true }
              );
              finalBuffer = resampleResult.buffer;
            }
            
            // Encode to base64
            const audioBase64 = finalBuffer.toString('base64');
            const audioMessage = {
              type: 'audio_input',
              audio: audioBase64
            };
            elevenLabsWs.send(JSON.stringify(audioMessage));
            console.log(`✅ Forwarded binary audio to ElevenLabs (${ELEVENLABS_SAMPLE_RATE}Hz PCM mono)`);
          } catch (error) {
            console.error('❌ Error forwarding binary audio to ElevenLabs:', error);
            console.error('   Error details:', error.message);
          }
        }
        // Forward to OpenAI if active (fallback)
        else if (openAIWs && openAIWs.readyState === WebSocket.OPEN && isInterviewActive && currentProvider === 'openai') {
          const audioBase64 = data instanceof Buffer ? data.toString('base64') : Buffer.from(rawData).toString('base64');
          const audioMessage = {
            type: 'input_audio_buffer.append',
            audio: audioBase64
          };
          openAIWs.send(JSON.stringify(audioMessage));
          console.log('✅ Forwarded audio data to OpenAI');
        } else {
          console.log('⚠️  Received audio but provider not ready - provider:', currentProvider, 'elevenLabsWs:', !!elevenLabsWs, 'openAIWs:', !!openAIWs, 'isInterviewActive:', isInterviewActive);
        }
        return;
      }
      
      // message is already parsed above if it's JSON
      // If we reach here, message should already be set
      if (!message) {
        console.error('❌ CRITICAL: Message is null after JSON parse attempt');
        return;
      }
      
      console.log('✅ Successfully parsed JSON message');
      
      // Log full message details
      console.log('📥 ========================================');
      console.log('📥 RECEIVED MESSAGE FROM FRONTEND');
      console.log('📥 Message Type:', message.type);
      console.log('📥 Full Message:', JSON.stringify(message, null, 2));
      console.log('📥 Timestamp:', new Date().toISOString());
      console.log('📥 WebSocket State:', frontendWs.readyState === WebSocket.OPEN ? 'OPEN' : 'NOT OPEN');
      console.log('📥 ========================================');
      
      if (message.type === 'start_interview') {
        console.log('🚀 ========================================');
        console.log('🚀 PROCESSING start_interview MESSAGE');
        console.log('🚀 ========================================');
        
        candidateContext = message.candidateContext || {};
        console.log('🎤 Starting interview for:', candidateContext.name || 'Unknown');
        console.log('📋 Candidate context:', JSON.stringify(candidateContext, null, 2));
        
        // CRITICAL: Send immediate acknowledgment BEFORE any async operations
        console.log('📤 ========================================');
        console.log('📤 SENDING IMMEDIATE ACKNOWLEDGMENT');
        console.log('📤 WebSocket State:', frontendWs.readyState === WebSocket.OPEN ? 'OPEN ✅' : 'NOT OPEN ❌');
        console.log('📤 ========================================');
        
        if (frontendWs.readyState === WebSocket.OPEN) {
          const acknowledgment = {
            type: 'interview_starting',
            message: 'Interview is starting...',
            timestamp: new Date().toISOString()
          };
          
          try {
            frontendWs.send(JSON.stringify(acknowledgment));
            console.log('✅ IMMEDIATE ACKNOWLEDGMENT SENT SUCCESSFULLY');
            console.log('✅ Sent data:', JSON.stringify(acknowledgment, null, 2));
          } catch (sendError) {
            console.error('❌ ERROR SENDING ACKNOWLEDGMENT:', sendError);
            console.error('❌ Error details:', sendError.message);
            console.error('❌ Error stack:', sendError.stack);
            return;
          }
        } else {
          console.error('❌ CRITICAL: Frontend WebSocket not open!');
          console.error('❌ WebSocket readyState:', frontendWs.readyState);
          console.error('❌ WebSocket states: CONNECTING=0, OPEN=1, CLOSING=2, CLOSED=3');
          return;
        }
        
        // Provider selection: default to ElevenLabs, fallback to OpenAI
        const voiceProvider = process.env.VOICE_PROVIDER || 'elevenlabs';
        console.log('🎯 Voice Provider:', voiceProvider);
        currentProvider = voiceProvider;
        
        // Try ElevenLabs first (primary provider)
        if (voiceProvider === 'elevenlabs') {
          const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
          if (!elevenLabsApiKey) {
            console.warn('⚠️ ELEVENLABS_API_KEY not set, falling back to OpenAI');
            currentProvider = 'openai';
          } else {
            try {
              console.log('🔌 Attempting to connect to ElevenLabs...');
              elevenLabsWs = await createElevenLabsConnection(elevenLabsApiKey, candidateContext);
              console.log('✅ ElevenLabs connection established');
              isInterviewActive = true;
              
              // Session metrics tracking for ElevenLabs
              const sessionStartTime = Date.now();
              const messageCounts = {
                'audio': 0,
                'transcript': 0,
                'user_speech_started': 0,
                'user_speech_ended': 0,
                'conversation_end': 0,
                'error': 0,
                'other': 0
              };
              
              // Chunk buffer for assembling incomplete PCM frames
              let pendingAudioBuffer = null;
              let lastChunkTime = null;
              
              // Set up ElevenLabs message handler
              elevenLabsWs.on('message', (elevenLabsData) => {
                try {
                  // ElevenLabs may send binary audio or JSON messages
                  if (elevenLabsData instanceof Buffer) {
                    // Binary audio data - buffer and validate before forwarding
                    messageCounts.audio++;
                    const now = Date.now();
                    const timeSinceLastChunk = lastChunkTime ? now - lastChunkTime : null;
                    lastChunkTime = now;
                    
                    const chunkSize = elevenLabsData.length;
                    console.log(`🔊 ElevenLabs audio chunk received: ${chunkSize} bytes${timeSinceLastChunk ? `, ${timeSinceLastChunk}ms since last chunk` : ''}`);
                    
                    // Check if chunk size is multiple of 2 (required for PCM16)
                    if (chunkSize % 2 !== 0) {
                      console.warn(`⚠️ Invalid chunk size from ElevenLabs: ${chunkSize} bytes (not multiple of 2). Buffering.`);
                    }
                    
                    // Combine with pending buffer if exists
                    let combinedBuffer;
                    if (pendingAudioBuffer) {
                      const pending = pendingAudioBuffer;
                      combinedBuffer = Buffer.concat([pending, elevenLabsData]);
                      console.log(`📦 Combined with pending buffer: ${pending.length} + ${chunkSize} = ${combinedBuffer.length} bytes`);
                      pendingAudioBuffer = null; // Clear pending buffer
                    } else {
                      combinedBuffer = elevenLabsData;
                    }
                    
                    // Check if combined buffer is still incomplete (not multiple of 2)
                    if (combinedBuffer.length % 2 !== 0) {
                      // Save incomplete chunk for next iteration
                      pendingAudioBuffer = combinedBuffer;
                      console.log(`📦 Buffering incomplete chunk: ${combinedBuffer.length} bytes (waiting for more data)`);
                      return; // Don't forward incomplete chunk
                    }
                    
                    // Check audio quality: verify PCM16 format and detect potential issues
                    // Log occasionally to monitor audio quality from ElevenLabs
                    if (Math.random() < 0.1 && combinedBuffer.length >= 4) {
                      try {
                        const samples = new Int16Array(combinedBuffer.buffer, combinedBuffer.byteOffset, Math.min(combinedBuffer.length / 2, 100));
                        const maxSample = Math.max(...Array.from(samples).map(Math.abs));
                        const avgSample = Array.from(samples).reduce((a, b) => a + Math.abs(b), 0) / samples.length;
                        
                        // Check for potential audio quality issues
                        if (maxSample > 32000) {
                          console.warn(`⚠️ High amplitude audio from ElevenLabs: max=${maxSample} (${(maxSample/32767*100).toFixed(1)}% of max)`);
                        }
                        if (avgSample < 100 && combinedBuffer.length > 1000) {
                          console.warn(`⚠️ Low amplitude audio from ElevenLabs: avg=${avgSample.toFixed(0)} (possible silence or quality issue)`);
                        }
                      } catch (e) {
                        // Ignore quality check errors
                      }
                    }
                    
                    // Validate minimum chunk size (320 bytes = 20ms at 16kHz)
                    const MIN_CHUNK_SIZE = 320;
                    if (combinedBuffer.length < MIN_CHUNK_SIZE && combinedBuffer.length > 0) {
                      console.warn(`⚠️ Very small chunk from ElevenLabs: ${combinedBuffer.length} bytes (< ${MIN_CHUNK_SIZE} bytes). Forwarding anyway.`);
                    }
                    
                    // Forward complete PCM frame to frontend
                    if (frontendWs.readyState === WebSocket.OPEN && combinedBuffer.length > 0) {
                      // At 16kHz PCM16: 32000 bytes = 16000 samples = 1 second
                      if (combinedBuffer.length > 32000 && Math.random() < 0.1) {
                        console.log(`🔊 Forwarding large audio chunk: ${combinedBuffer.length} bytes (16kHz PCM)`);
                      }
                      frontendWs.send(combinedBuffer);
                      console.log(`✅ Forwarded complete PCM frame: ${combinedBuffer.length} bytes`);
                    }
                    return;
                  }
                  
                  // JSON message
                  const elevenLabsMessage = JSON.parse(elevenLabsData.toString());
                  const messageType = elevenLabsMessage.type || elevenLabsMessage.event || 'other';
                  
                  // Track message counts
                  if (messageCounts.hasOwnProperty(messageType)) {
                    messageCounts[messageType]++;
                  } else {
                    messageCounts.other++;
                  }
                  
                  console.log('📨 ElevenLabs message:', messageType, JSON.stringify(elevenLabsMessage).substring(0, 200));
                  
                  // Map ElevenLabs events to frontend message types
                  switch (messageType) {
                    case 'conversation_init_response':
                    case 'conversation_started':
                      // Conversation initialized - send interview_started
                      console.log('✓ ElevenLabs conversation started');
                      if (frontendWs.readyState === WebSocket.OPEN) {
                        frontendWs.send(JSON.stringify({
                          type: 'interview_started',
                          message: 'Interview session started successfully',
                          timestamp: new Date().toISOString()
                        }));
                      }
                      break;
                      
                    case 'audio':
                    case 'audio_chunk':
                      // Audio chunk from JSON message (base64 encoded) - decode and buffer
                      messageCounts.audio++;
                      if (elevenLabsMessage.audio && frontendWs.readyState === WebSocket.OPEN) {
                        try {
                          const audioBuffer = Buffer.from(elevenLabsMessage.audio, 'base64');
                          const chunkSize = audioBuffer.length;
                          const now = Date.now();
                          const timeSinceLastChunk = lastChunkTime ? now - lastChunkTime : null;
                          lastChunkTime = now;
                          
                          console.log(`🔊 ElevenLabs audio chunk (base64): ${chunkSize} bytes${timeSinceLastChunk ? `, ${timeSinceLastChunk}ms since last chunk` : ''}`);
                          
                          // Check if chunk size is multiple of 2
                          if (chunkSize % 2 !== 0) {
                            console.warn(`⚠️ Invalid chunk size from ElevenLabs (base64): ${chunkSize} bytes (not multiple of 2). Buffering.`);
                          }
                          
                          // Combine with pending buffer if exists
                          let combinedBuffer;
                          if (pendingAudioBuffer) {
                            const pending = pendingAudioBuffer;
                            combinedBuffer = Buffer.concat([pending, audioBuffer]);
                            console.log(`📦 Combined with pending buffer: ${pending.length} + ${chunkSize} = ${combinedBuffer.length} bytes`);
                            pendingAudioBuffer = null;
                          } else {
                            combinedBuffer = audioBuffer;
                          }
                          
                          // Check if combined buffer is still incomplete
                          if (combinedBuffer.length % 2 !== 0) {
                            pendingAudioBuffer = combinedBuffer;
                            console.log(`📦 Buffering incomplete chunk: ${combinedBuffer.length} bytes`);
                            break; // Don't forward incomplete chunk
                          }
                          
                          // Forward complete PCM frame
                          if (combinedBuffer.length > 0) {
                            frontendWs.send(combinedBuffer);
                            console.log(`✅ Forwarded complete PCM frame (base64): ${combinedBuffer.length} bytes`);
                          }
                        } catch (error) {
                          console.error('❌ Error processing ElevenLabs base64 audio:', error);
                        }
                      }
                      break;
                      
                    case 'transcript':
                    case 'agent_speech_transcript':
                      // AI transcript
                      messageCounts.transcript++;
                      if (frontendWs.readyState === WebSocket.OPEN) {
                        frontendWs.send(JSON.stringify({
                          type: 'ai_transcription',
                          text: elevenLabsMessage.text || elevenLabsMessage.transcript || '',
                          is_final: elevenLabsMessage.is_final !== false
                        }));
                      }
                      break;
                      
                    case 'user_speech_started':
                    case 'user_started_speaking':
                      // User started speaking
                      messageCounts.user_speech_started++;
                      console.log('🎤 ElevenLabs: User speech started');
                      if (frontendWs.readyState === WebSocket.OPEN) {
                        frontendWs.send(JSON.stringify({
                          type: 'student_speech_started'
                        }));
                      }
                      break;
                      
                    case 'user_speech_ended':
                    case 'user_stopped_speaking':
                      // User stopped speaking
                      messageCounts.user_speech_ended++;
                      console.log('🎤 ElevenLabs: User speech ended');
                      if (frontendWs.readyState === WebSocket.OPEN) {
                        frontendWs.send(JSON.stringify({
                          type: 'student_speech_ended'
                        }));
                      }
                      break;
                      
                    case 'user_transcript':
                    case 'user_speech_transcript':
                      // User transcript
                      if (frontendWs.readyState === WebSocket.OPEN) {
                        frontendWs.send(JSON.stringify({
                          type: 'student_transcription',
                          text: elevenLabsMessage.text || elevenLabsMessage.transcript || '',
                          is_final: elevenLabsMessage.is_final !== false
                        }));
                      }
                      break;
                      
                    case 'conversation_end':
                    case 'conversation_ended':
                      // Conversation ended
                      messageCounts.conversation_end++;
                      console.log('✅ ElevenLabs conversation ended');
                      if (frontendWs.readyState === WebSocket.OPEN) {
                        frontendWs.send(JSON.stringify({
                          type: 'interview_ended',
                          message: 'Interview session ended'
                        }));
                      }
                      break;
                      
                    case 'error':
                      // Error handling
                      messageCounts.error++;
                      console.error('❌ ElevenLabs error:', elevenLabsMessage);
                      if (frontendWs.readyState === WebSocket.OPEN) {
                        frontendWs.send(JSON.stringify({
                          type: 'error',
                          message: elevenLabsMessage.message || 'ElevenLabs API error',
                          code: elevenLabsMessage.code
                        }));
                      }
                      break;
                      
                    default:
                      // Log unknown message types for debugging
                      console.log('📨 Unknown ElevenLabs message type:', messageType, JSON.stringify(elevenLabsMessage).substring(0, 200));
                      break;
                  }
                } catch (error) {
                  console.error('❌ Error processing ElevenLabs message:', error);
                }
              });
              
              elevenLabsWs.on('error', (error) => {
                console.error('❌ ElevenLabs WebSocket error:', error);
                if (frontendWs.readyState === WebSocket.OPEN) {
                  frontendWs.send(JSON.stringify({
                    type: 'error',
                    message: 'ElevenLabs connection error'
                  }));
                }
              });
              
              elevenLabsWs.on('close', () => {
                const sessionEndTime = Date.now();
                const sessionDuration = sessionEndTime - sessionStartTime;
                console.log('✓ ElevenLabs connection closed');
                console.log('📊 ElevenLabs Session Metrics:');
                console.log(`   Duration: ${(sessionDuration / 1000).toFixed(2)}s`);
                console.log('   Message Counts:', JSON.stringify(messageCounts, null, 2));
                isInterviewActive = false;
                if (frontendWs.readyState === WebSocket.OPEN) {
                  frontendWs.send(JSON.stringify({
                    type: 'interview_ended'
                  }));
                }
              });
              
              // Send interview_started message
              if (frontendWs.readyState === WebSocket.OPEN) {
                frontendWs.send(JSON.stringify({
                  type: 'interview_started',
                  message: 'Interview session started successfully',
                  timestamp: new Date().toISOString()
                }));
              }
              
              // Continue with audio forwarding setup
              return; // Exit early since ElevenLabs is set up
              
            } catch (elevenLabsError) {
              console.error('❌ ElevenLabs connection failed:', elevenLabsError);
              console.log('🔄 Falling back to OpenAI...');
              currentProvider = 'openai';
            }
          }
        }
        
        // Fallback to OpenAI if ElevenLabs failed or not selected
        if (currentProvider === 'openai' || !elevenLabsWs) {
          const apiKey = process.env.OPENAI_API_KEY;
          if (!apiKey) {
            console.error('❌ OPENAI_API_KEY not set!');
            if (frontendWs.readyState === WebSocket.OPEN) {
              frontendWs.send(JSON.stringify({
                type: 'error',
                message: 'Neither ELEVENLABS_API_KEY nor OPENAI_API_KEY is set on server'
              }));
            }
            return;
          }
          
          console.log('🔑 OpenAI API key found, creating connection...');
          const systemPrompt = createSystemPrompt(candidateContext);
          console.log('📝 System prompt created, length:', systemPrompt.length);
          
          try {
            console.log('🔌 Attempting to connect to OpenAI...');
            openAIWs = await createOpenAIConnection(apiKey, systemPrompt);
            console.log('✅ OpenAI connection established');
            isInterviewActive = true;
          
          let sessionReady = false;
          let currentResponseId = null; // Track current response ID for cancellation
          
          // Session metrics tracking
          const sessionStartTime = Date.now();
          const messageCounts = {
            'response.created': 0,
            'response.audio.delta': 0,
            'response.audio_transcript.delta': 0,
            'response.audio_transcript.done': 0,
            'input_audio_buffer.speech_started': 0,
            'input_audio_buffer.speech_stopped': 0,
            'response.done': 0,
            'response.audio.done': 0,
            'conversation.item.input_audio_transcript.completed': 0,
            'error': 0,
            'other': 0
          };
          let lastSpeechStartedTime = null;
          let lastSpeechStoppedTime = null;
          
          openAIWs.on('message', (openAIData) => {
            try {
              const openAIMessage = JSON.parse(openAIData.toString());
              
              // Track message counts
              const messageType = openAIMessage.type || 'other';
              if (messageCounts.hasOwnProperty(messageType)) {
                messageCounts[messageType]++;
              } else {
                messageCounts.other++;
              }
              
              // Handle session.updated event
              if (openAIMessage.type === 'session.updated') {
                console.log('✓ OpenAI session updated and ready');
                sessionReady = true;
                // Trigger AI to start speaking now that session is ready
                setTimeout(() => {
                  if (openAIWs && openAIWs.readyState === WebSocket.OPEN) {
                    // Reduced logging
                    try {
                      openAIWs.send(JSON.stringify({
                        type: 'response.create',
                        response: {
                          modalities: ['text', 'audio']
                        }
                      }));
                    } catch (error) {
                      console.error('❌ Error sending response.create:', error);
                    }
                  }
                }, 500);
                return;
              }
              
              switch (openAIMessage.type) {
                case 'response.created':
                  // Track response ID for cancellation
                  currentResponseId = openAIMessage.response?.id || null;
                  if (currentResponseId) {
                    console.log('📝 Tracking response ID:', currentResponseId);
                  }
                  break;
                  
                case 'response.audio.delta':
                  if (frontendWs.readyState === WebSocket.OPEN) {
                    try {
                      // Validate base64 data exists
                      if (!openAIMessage.delta || typeof openAIMessage.delta !== 'string') {
                        console.warn('⚠️ Invalid audio delta data received from OpenAI');
                        break;
                      }
                      
                      // Decode base64 to buffer immediately
                      const audioBuffer = Buffer.from(openAIMessage.delta, 'base64');
                      
                      // Validate buffer size
                      if (audioBuffer.length === 0) {
                        console.warn('⚠️ Empty audio buffer received, skipping');
                        break;
                      }
                      
                      // Reduced logging - only log anomalies
                      // Detect unusually large or small chunks
                      // PCM16 is 2 bytes per sample, so 32000 bytes = 16000 samples = 1 second at 16kHz
                      // 64000 bytes would be 2 seconds
                      if (audioBuffer.length > 32000) { // > 1 second at 16kHz
                        if (Math.random() < 0.1) {
                          console.warn('⚠️ Unusually large audio chunk:', audioBuffer.length, 'bytes');
                        }
                      }
                      if (audioBuffer.length < 100) {
                        if (Math.random() < 0.1) {
                          console.warn('⚠️ Unusually small audio chunk:', audioBuffer.length, 'bytes');
                        }
                      }
                      
                      // Forward immediately without buffering
                      // Check if WebSocket is ready to send (not in backpressure)
                      const bufferedAmount = frontendWs.bufferedAmount;
                      if (bufferedAmount === 0 || bufferedAmount < 512 * 1024) {
                        // Less than 512KB buffered, safe to send
                        frontendWs.send(audioBuffer);
                      } else if (bufferedAmount < 1024 * 1024) {
                        // Moderate backpressure (512KB-1MB), send but log warning
                        if (Math.random() < 0.1) {
                          console.warn('⚠️ WebSocket backpressure detected, buffered:', bufferedAmount, 'bytes');
                        }
                        frontendWs.send(audioBuffer);
                      } else {
                        // Severe backpressure (>1MB), drop old chunks or skip this chunk
                        console.warn('⚠️ Severe WebSocket backpressure, buffered:', bufferedAmount, 'bytes. Dropping audio chunk.');
                        // Don't send - let frontend catch up
                        // Frontend will request more when ready
                      }
                    } catch (error) {
                      console.error('❌ Error forwarding audio delta:', error);
                      // Continue processing other messages
                    }
                  }
                  break;
                  
                case 'response.audio_transcript.delta':
                  // Reduced logging - only log occasionally
                  if (Math.random() < 0.05) {
                    console.log('📝 OpenAI transcript delta received');
                  }
                  if (frontendWs.readyState === WebSocket.OPEN) {
                    const transcriptMessage = {
                      type: 'ai_transcription',
                      text: openAIMessage.delta,
                      is_final: false
                    };
                    frontendWs.send(JSON.stringify(transcriptMessage));
                  }
                  break;
                  
                case 'response.audio_transcript.done':
                  // Keep this log as it's important
                  console.log('✅ OpenAI transcript done:', openAIMessage.text);
                  if (frontendWs.readyState === WebSocket.OPEN) {
                    const transcriptMessage = {
                      type: 'ai_transcription',
                      text: openAIMessage.text,
                      is_final: true
                    };
                    frontendWs.send(JSON.stringify(transcriptMessage));
                  }
                  break;
                  
                case 'input_audio_buffer.speech_started':
                  // Keep this log as it's important
                  const speechStartTime = Date.now();
                  lastSpeechStartedTime = speechStartTime;
                  
                  // Calculate time since last speech stopped (if available)
                  let timeSinceLastStop = null;
                  if (lastSpeechStoppedTime) {
                    timeSinceLastStop = speechStartTime - lastSpeechStoppedTime;
                    console.log(`🎤 Student speech started detected (${timeSinceLastStop}ms since last stop) - canceling AI response`);
                  } else {
                    console.log('🎤 Student speech started detected - canceling AI response');
                  }
                  
                  // Cancel ongoing AI response when user starts speaking
                  if (openAIWs && openAIWs.readyState === WebSocket.OPEN) {
                    try {
                      // Send explicit response.cancel if we have the response ID
                      if (currentResponseId) {
                        openAIWs.send(JSON.stringify({ 
                          type: 'response.cancel', 
                          response_id: currentResponseId 
                        }));
                        console.log('🛑 Sent response.cancel for response:', currentResponseId);
                        currentResponseId = null; // Clear after canceling
                      } else {
                        // Server VAD will handle interruption, but log for debugging
                        console.log('🛑 User interrupted - server VAD will handle (no response ID tracked)');
                      }
                    } catch (error) {
                      console.error('❌ Error handling speech interruption:', error);
                    }
                  }
                  
                  if (frontendWs.readyState === WebSocket.OPEN) {
                    frontendWs.send(JSON.stringify({
                      type: 'student_speech_started'
                    }));
                  }
                  break;
                
                case 'input_audio_buffer.speech_stopped':
                  const speechStopTime = Date.now();
                  lastSpeechStoppedTime = speechStopTime;
                  
                  // Calculate speech duration if we have start time
                  if (lastSpeechStartedTime) {
                    const speechDuration = speechStopTime - lastSpeechStartedTime;
                    console.log(`🎤 Student speech stopped (duration: ${speechDuration}ms)`);
                  } else {
                    console.log('🎤 Student speech stopped');
                  }
                  
                  if (frontendWs.readyState === WebSocket.OPEN) {
                    frontendWs.send(JSON.stringify({
                      type: 'student_speech_ended'
                    }));
                  }
                  break;
                
                case 'response.done':
                  // Keep this log as it's important
                  console.log('✅ AI response completed');
                  currentResponseId = null; // Clear response ID
                  if (frontendWs.readyState === WebSocket.OPEN) {
                    frontendWs.send(JSON.stringify({
                      type: 'ai_response_done'
                    }));
                  }
                  break;
                
                case 'response.audio.done':
                  // Keep this log as it's important
                  console.log('✅ AI audio stream completed');
                  currentResponseId = null; // Clear response ID
                  if (frontendWs.readyState === WebSocket.OPEN) {
                    frontendWs.send(JSON.stringify({
                      type: 'ai_audio_done'
                    }));
                  }
                  break;
                  
                case 'conversation.item.input_audio_transcript.completed':
                  console.log('📝 Student transcript completed:', openAIMessage.transcript);
                  if (frontendWs.readyState === WebSocket.OPEN) {
                    frontendWs.send(JSON.stringify({
                      type: 'student_transcription',
                      text: openAIMessage.transcript,
                      is_final: true
                    }));
                    console.log('📤 Sent student_transcription to frontend');
                  }
                  break;
                  
                case 'error':
                  console.error('❌ ========================================');
                  console.error('❌ OPENAI ERROR RECEIVED');
                  console.error('❌ Error type:', openAIMessage.error?.type);
                  console.error('❌ Error code:', openAIMessage.error?.code);
                  console.error('❌ Error message:', openAIMessage.error?.message);
                  
                  // Provide specific guidance for common errors
                  if (openAIMessage.error?.code === 'invalid_api_key') {
                    console.error('❌ ========================================');
                    console.error('❌ INVALID API KEY ERROR');
                    console.error('❌ This usually means:');
                    console.error('   1. The API key is incorrect or has a typo');
                    console.error('   2. The API key was revoked or expired');
                    console.error('   3. The API key does not have access to Realtime API');
                    console.error('   4. You may be using an organization API key that needs permissions');
                    console.error('❌ Solution:');
                    console.error('   1. Go to https://platform.openai.com/account/api-keys');
                    console.error('   2. Verify your API key is correct');
                    console.error('   3. Create a new key if needed');
                    console.error('   4. Ensure the key has access to Realtime API');
                    console.error('   5. Update OPENAI_API_KEY in Railway Variables');
                    console.error('❌ ========================================');
                  } else if (openAIMessage.error?.code === 'insufficient_quota') {
                    console.error('❌ ========================================');
                    console.error('❌ INSUFFICIENT QUOTA ERROR');
                    console.error('❌ Your OpenAI account has run out of credits');
                    console.error('❌ Solution: Add credits at https://platform.openai.com/account/billing');
                    console.error('❌ ========================================');
                  } else if (openAIMessage.error?.code === 'rate_limit_exceeded') {
                    console.error('❌ ========================================');
                    console.error('❌ RATE LIMIT EXCEEDED');
                    console.error('❌ You are making too many requests too quickly');
                    console.error('❌ Solution: Wait a moment and try again');
                    console.error('❌ ========================================');
                  }
                  
                  console.error('❌ Full error:', JSON.stringify(openAIMessage, null, 2));
                  console.error('❌ ========================================');
                  
                  if (frontendWs.readyState === WebSocket.OPEN) {
                    let userMessage = openAIMessage.error?.message || 'OpenAI API error';
                    
                    // Provide user-friendly error messages
                    if (openAIMessage.error?.code === 'invalid_api_key') {
                      userMessage = 'Invalid OpenAI API key. Please check your API key configuration.';
                    } else if (openAIMessage.error?.code === 'insufficient_quota') {
                      userMessage = 'OpenAI account has insufficient credits. Please add credits to your account.';
                    } else if (openAIMessage.error?.code === 'rate_limit_exceeded') {
                      userMessage = 'Rate limit exceeded. Please wait a moment and try again.';
                    }
                    
                    const errorMessage = {
                      type: 'error',
                      message: userMessage,
                      code: openAIMessage.error?.code,
                      details: openAIMessage.error?.type
                    };
                    frontendWs.send(JSON.stringify(errorMessage));
                    console.log('📤 Sent error message to frontend');
                  }
                  break;
                  
                default:
                  // Log unhandled message types occasionally for debugging
                  if (Math.random() < 0.01 && !openAIMessage.type?.startsWith('input_audio_buffer')) {
                    console.log('📨 Unhandled OpenAI message type:', openAIMessage.type);
                  }
                  break;
              }
            } catch (error) {
              console.error('❌ Error processing OpenAI message:', error);
            }
          });
          
          openAIWs.on('error', (error) => {
            console.error('❌ OpenAI WebSocket error:', error);
            if (frontendWs.readyState === WebSocket.OPEN) {
              frontendWs.send(JSON.stringify({
                type: 'error',
                message: 'OpenAI connection error'
              }));
            }
          });
          
          openAIWs.on('close', () => {
            const sessionEndTime = Date.now();
            const sessionDuration = sessionEndTime - sessionStartTime;
            const sessionDurationSeconds = (sessionDuration / 1000).toFixed(2);
            
            console.log('✓ OpenAI connection closed');
            console.log('📊 Session Metrics:');
            console.log(`   Duration: ${sessionDurationSeconds}s (${sessionDuration}ms)`);
            console.log('   Message Counts:', JSON.stringify(messageCounts, null, 2));
            console.log(`   Total Messages: ${Object.values(messageCounts).reduce((a, b) => a + b, 0)}`);
            
            isInterviewActive = false;
            if (frontendWs.readyState === WebSocket.OPEN) {
              frontendWs.send(JSON.stringify({
                type: 'interview_ended'
              }));
            }
          });
          
          // Send interview_started immediately - AI will start speaking after session.updated
          console.log('📤 ========================================');
          console.log('📤 SENDING interview_started MESSAGE');
          console.log('📤 WebSocket State:', frontendWs.readyState === WebSocket.OPEN ? 'OPEN ✅' : 'NOT OPEN ❌');
          console.log('📤 ========================================');
          
          if (frontendWs.readyState === WebSocket.OPEN) {
            const interviewStartedMessage = {
              type: 'interview_started',
              message: 'Interview session started successfully',
              timestamp: new Date().toISOString()
            };
            
            try {
              frontendWs.send(JSON.stringify(interviewStartedMessage));
              console.log('✅ interview_started message sent successfully');
              console.log('✅ Message content:', JSON.stringify(interviewStartedMessage, null, 2));
            } catch (sendError) {
              console.error('❌ ERROR SENDING interview_started:', sendError);
              console.error('❌ Error details:', sendError.message);
            }
          } else {
            console.error('❌ CRITICAL: Frontend WebSocket not open, cannot send interview_started');
            console.error('❌ WebSocket readyState:', frontendWs.readyState);
          }
          
        } catch (error) {
          console.error('❌ Failed to connect to OpenAI:', error);
          console.error('Error details:', error.message);
          console.error('Error stack:', error.stack);
          if (frontendWs.readyState === WebSocket.OPEN) {
            const errorMessage = {
              type: 'error',
              message: `Failed to start interview: ${error.message || 'Unknown error'}`
            };
            console.log('📤 Sending error message to frontend:', errorMessage);
            frontendWs.send(JSON.stringify(errorMessage));
          } else {
            console.error('❌ Frontend WebSocket not open, cannot send error message');
          }
        }
        } // Close if block for OpenAI fallback (line 792: if (currentProvider === 'openai' || !elevenLabsWs))
      } else if (message.type === 'end_interview') {
        console.log('🛑 ========================================');
        console.log('🛑 PROCESSING end_interview MESSAGE');
        console.log('🛑 ========================================');
        isInterviewActive = false;
        if (elevenLabsWs && elevenLabsWs.readyState === WebSocket.OPEN) {
          elevenLabsWs.close();
        }
        if (openAIWs && openAIWs.readyState === WebSocket.OPEN) {
          openAIWs.close();
        }
        if (frontendWs.readyState === WebSocket.OPEN) {
          frontendWs.send(JSON.stringify({
            type: 'interview_ended',
            message: 'Interview session ended'
          }));
          console.log('✅ Sent interview_ended message');
        }
      } else if (message.type === 'audio_chunk' && message.audio) {
        console.log('🎵 Processing audio_chunk message');
        
        // Forward to ElevenLabs if active
        if (elevenLabsWs && elevenLabsWs.readyState === WebSocket.OPEN && isInterviewActive && currentProvider === 'elevenlabs') {
          try {
            // Decode base64 audio
            const audioBuffer = Buffer.from(message.audio, 'base64');
            
            // Validate PCM16 format
            if (!isValidPCM16(audioBuffer)) {
              console.error('❌ Invalid PCM16 audio format: buffer length must be multiple of 2');
              return;
            }
            
            // Get source sample rate from message or estimate
            const sourceSampleRate = message.sampleRate || estimateSampleRate(audioBuffer);
            const sourceChannels = message.channels || 1;
            const targetSampleRate = ELEVENLABS_SAMPLE_RATE; // ElevenLabs requires 16kHz
            
            console.log(`[AUDIO-RESAMPLE] Received audio: ${audioBuffer.length} bytes, ${sourceSampleRate}Hz, ${sourceChannels} channel(s)`);
            
            // Resample to 16kHz if needed
            let resampledAudio;
            let finalBase64;
            
            if (sourceSampleRate === targetSampleRate && sourceChannels === 1) {
              // Already correct format
              console.log(`[AUDIO-RESAMPLE] ✅ Audio already at ${targetSampleRate}Hz mono - no resampling needed`);
              finalBase64 = message.audio; // Use original base64
            } else {
              // Resample to ELEVENLABS_SAMPLE_RATE (16kHz) mono
              console.log(`[AUDIO-RESAMPLE] 🔄 Resampling ${sourceSampleRate}Hz → ${targetSampleRate}Hz${sourceChannels === 2 ? ' (stereo → mono)' : ''}`);
              
              const resampleResult = resampleAudio(
                audioBuffer,
                sourceSampleRate,
                targetSampleRate,
                sourceChannels,
                { logDetails: true }
              );
              
              resampledAudio = resampleResult.buffer;
              
              // Re-encode to base64
              finalBase64 = resampledAudio.toString('base64');
              
              console.log(`[AUDIO-RESAMPLE] ✅ Resampling complete: ${audioBuffer.length} bytes → ${resampledAudio.length} bytes`);
            }
            
            // Send to ElevenLabs with correct format
            const audioMessage = {
              type: 'audio_input',
              audio: finalBase64 // Base64 encoded PCM16 audio at ELEVENLABS_SAMPLE_RATE (16kHz) mono
            };
            
            elevenLabsWs.send(JSON.stringify(audioMessage));
            console.log(`✅ Forwarded audio_chunk to ElevenLabs (${targetSampleRate}Hz PCM16 mono)`);
          } catch (error) {
            console.error('❌ Error processing/forwarding audio to ElevenLabs:', error);
            console.error('   Error details:', error.message);
            console.error('   Stack:', error.stack);
          }
        }
        // Forward to OpenAI if active (fallback)
        else if (openAIWs && openAIWs.readyState === WebSocket.OPEN && isInterviewActive && currentProvider === 'openai') {
          const audioMessage = {
            type: 'input_audio_buffer.append',
            audio: message.audio
          };
          openAIWs.send(JSON.stringify(audioMessage));
          console.log('✅ Forwarded audio_chunk to OpenAI');
        } else {
          console.log('⚠️  Cannot forward audio - provider not ready');
        }
      } else {
        console.log('⚠️  UNKNOWN MESSAGE TYPE:', message.type);
        console.log('⚠️  Full message:', JSON.stringify(message, null, 2));
        if (frontendWs.readyState === WebSocket.OPEN) {
          frontendWs.send(JSON.stringify({
            type: 'error',
            message: `Unknown message type: ${message.type}`
          }));
        }
      }
    } catch (error) {
      console.error('❌ Error handling frontend message:', error);
      if (frontendWs.readyState === WebSocket.OPEN) {
        frontendWs.send(JSON.stringify({
          type: 'error',
          message: error.message || 'Unknown error occurred'
        }));
      }
    }
  });
  
  frontendWs.on('close', (code, reason) => {
    console.log('🔌 ========================================');
    console.log('🔌 FRONTEND WEBSOCKET CLOSED');
    console.log('🔌 Close code:', code);
    console.log('🔌 Close reason:', reason?.toString() || 'No reason provided');
    console.log('🔌 ========================================');
    if (pingInterval) clearInterval(pingInterval);
    if (elevenLabsWs && elevenLabsWs.readyState === WebSocket.OPEN) {
      elevenLabsWs.close();
    }
    if (openAIWs && openAIWs.readyState === WebSocket.OPEN) {
      openAIWs.close();
    }
    isInterviewActive = false;
  });
  
  frontendWs.on('error', (error) => {
    console.error('❌ ========================================');
    console.error('❌ FRONTEND WEBSOCKET ERROR');
    console.error('❌ Error:', error);
    console.error('❌ Error message:', error.message);
    console.error('❌ Error stack:', error.stack);
    console.error('❌ ========================================');
    if (pingInterval) clearInterval(pingInterval);
    if (elevenLabsWs && elevenLabsWs.readyState === WebSocket.OPEN) {
      elevenLabsWs.close();
    }
    if (openAIWs && openAIWs.readyState === WebSocket.OPEN) {
      openAIWs.close();
    }
  });
  
  // Send initial connected message
  console.log('📤 ========================================');
  console.log('📤 SENDING INITIAL "connected" MESSAGE');
  console.log('📤 WebSocket State:', frontendWs.readyState === WebSocket.OPEN ? 'OPEN ✅' : 'NOT OPEN ⚠️');
  console.log('📤 ========================================');
  
  try {
    const connectedMessage = {
      type: 'connected',
      message: 'Connected to voice interview server. Send "start_interview" to begin.',
      timestamp: new Date().toISOString()
    };
    frontendWs.send(JSON.stringify(connectedMessage));
    console.log('✅ Initial "connected" message sent successfully');
    console.log('✅ Message content:', JSON.stringify(connectedMessage, null, 2));
  } catch (sendError) {
    console.error('❌ ERROR SENDING INITIAL CONNECTED MESSAGE:', sendError);
    console.error('❌ Error details:', sendError.message);
  }
}

function createVoiceServer(httpServer) {
  console.log('🎤 Creating voice interview WebSocket server...');
  
  const wss = new WebSocket.Server({
    server: httpServer,
    path: '/voice',
    perMessageDeflate: false,
    // Verify origin for WebSocket connections (security)
    verifyClient: (info) => {
      const origin = info.origin;
      
      // Allow if no origin (same-origin or direct connection)
      if (!origin) {
        return true;
      }
      
      // Allow Vercel domains
      if (origin.includes('.vercel.app')) {
        return true;
      }
      
      // Allow localhost for development
      if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
        return true;
      }
      
      // Allow explicitly configured frontend URL
      const frontendUrl = process.env.FRONTEND_URL;
      if (frontendUrl && origin === frontendUrl) {
        return true;
      }
      
      // Log blocked origins for debugging
      console.log(`⚠️  WebSocket: Blocked origin: ${origin}`);
      return false;
    }
  });
  
  wss.on('connection', (ws, req) => {
    const origin = req.headers.origin;
    console.log(`🔌 WebSocket connection from origin: ${origin || 'same-origin'}`);
    handleFrontendConnection(ws, httpServer);
  });
  
  wss.on('error', (error) => {
    console.error('❌ Voice WebSocket server error:', error);
  });
  
  console.log('✓ Voice WebSocket server ready on path /voice');
  return wss;
}

module.exports = {
  createVoiceServer,
  createSystemPrompt,
  handleFrontendConnection
};

