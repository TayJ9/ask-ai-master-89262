// ============================================================================
// Voice Interview WebSocket Server
// ============================================================================
const WebSocket = require('ws');

const OPENAI_REALTIME_API_URL = 'wss://api.openai.com/v1/realtime';
const OPENAI_MODEL = 'gpt-4o-realtime-preview-2024-10-01';
const PING_INTERVAL = 30000;

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
      clearTimeout(connectionTimeout);
      
      const configMessage = {
        type: 'session.update',
        session: {
          modalities: ['text', 'audio'],
          instructions: systemPrompt,
          voice: 'coral',
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

function handleFrontendConnection(frontendWs, httpServer) {
  console.log('🎯 ========================================');
  console.log('🎯 NEW FRONTEND WEBSOCKET CONNECTION');
  console.log('🎯 ========================================');
  console.log('🎯 WebSocket readyState:', frontendWs.readyState === WebSocket.OPEN ? 'OPEN' : 'CONNECTING');
  console.log('🎯 Timestamp:', new Date().toISOString());
  
  let openAIWs = null;
  let candidateContext = null;
  let pingInterval = null;
  let isInterviewActive = false;
  
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
        console.log('🎵 Processing binary audio data, length:', data instanceof Buffer ? data.length : rawData.length);
        if (openAIWs && openAIWs.readyState === WebSocket.OPEN && isInterviewActive) {
          const audioBase64 = data instanceof Buffer ? data.toString('base64') : Buffer.from(rawData).toString('base64');
          const audioMessage = {
            type: 'input_audio_buffer.append',
            audio: audioBase64
          };
          openAIWs.send(JSON.stringify(audioMessage));
          console.log('✅ Forwarded audio data to OpenAI');
        } else {
          console.log('⚠️  Received audio but OpenAI not ready - openAIWs:', !!openAIWs, 'readyState:', openAIWs?.readyState, 'isInterviewActive:', isInterviewActive);
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
        
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
          console.error('❌ OPENAI_API_KEY not set!');
          if (frontendWs.readyState === WebSocket.OPEN) {
            frontendWs.send(JSON.stringify({
              type: 'error',
              message: 'OPENAI_API_KEY environment variable is not set on server'
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
          
          openAIWs.on('message', (openAIData) => {
            try {
              const openAIMessage = JSON.parse(openAIData.toString());
              
              // Handle session.updated event
              if (openAIMessage.type === 'session.updated') {
                console.log('✓ OpenAI session updated and ready');
                sessionReady = true;
                // Trigger AI to start speaking now that session is ready
                setTimeout(() => {
                  if (openAIWs && openAIWs.readyState === WebSocket.OPEN) {
                    console.log('🎤 Triggering AI to start speaking...');
                    try {
                      openAIWs.send(JSON.stringify({
                        type: 'response.create',
                        response: {
                          modalities: ['text', 'audio']
                        }
                      }));
                      console.log('✓ Response creation request sent to OpenAI');
                    } catch (error) {
                      console.error('❌ Error sending response.create:', error);
                    }
                  }
                }, 500);
                return;
              }
              
              switch (openAIMessage.type) {
                case 'response.audio.delta':
                  if (frontendWs.readyState === WebSocket.OPEN) {
                    const audioBuffer = Buffer.from(openAIMessage.delta, 'base64');
                    frontendWs.send(audioBuffer);
                    // Log periodically, not every delta (too verbose)
                    if (Math.random() < 0.01) { // Log ~1% of audio deltas
                      console.log('🎵 Forwarded audio delta to frontend');
                    }
                  }
                  break;
                  
                case 'response.audio_transcript.delta':
                  console.log('📝 OpenAI transcript delta:', openAIMessage.delta);
                  if (frontendWs.readyState === WebSocket.OPEN) {
                    const transcriptMessage = {
                      type: 'ai_transcription',
                      text: openAIMessage.delta,
                      is_final: false
                    };
                    frontendWs.send(JSON.stringify(transcriptMessage));
                    console.log('📤 Sent ai_transcription delta to frontend');
                  }
                  break;
                  
                case 'response.audio_transcript.done':
                  console.log('✅ OpenAI transcript done:', openAIMessage.text);
                  if (frontendWs.readyState === WebSocket.OPEN) {
                    const transcriptMessage = {
                      type: 'ai_transcription',
                      text: openAIMessage.text,
                      is_final: true
                    };
                    frontendWs.send(JSON.stringify(transcriptMessage));
                    console.log('📤 Sent final ai_transcription to frontend');
                  }
                  break;
                  
                case 'input_audio_buffer.speech_started':
                  console.log('🎤 Student speech started detected');
                  if (frontendWs.readyState === WebSocket.OPEN) {
                    frontendWs.send(JSON.stringify({
                      type: 'student_speech_started'
                    }));
                    console.log('📤 Sent student_speech_started to frontend');
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
                  console.log('ℹ️  Unhandled OpenAI message type:', openAIMessage.type);
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
            console.log('✓ OpenAI connection closed');
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
      } else if (message.type === 'end_interview') {
        console.log('🛑 ========================================');
        console.log('🛑 PROCESSING end_interview MESSAGE');
        console.log('🛑 ========================================');
        isInterviewActive = false;
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
        if (openAIWs && openAIWs.readyState === WebSocket.OPEN && isInterviewActive) {
          const audioMessage = {
            type: 'input_audio_buffer.append',
            audio: message.audio
          };
          openAIWs.send(JSON.stringify(audioMessage));
          console.log('✅ Forwarded audio_chunk to OpenAI');
        } else {
          console.log('⚠️  Cannot forward audio - OpenAI not ready');
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

