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
          voice: 'alloy',
          input_audio_format: 'pcm16',
          output_audio_format: 'pcm16',
          turn_detection: {
            type: 'server_vad',
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 500
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
  console.log('✓ New frontend WebSocket connection established');
  
  let openAIWs = null;
  let candidateContext = null;
  let pingInterval = null;
  let isInterviewActive = false;
  
  pingInterval = setInterval(() => {
    if (frontendWs.readyState === WebSocket.OPEN) {
      frontendWs.ping();
    }
  }, PING_INTERVAL);
  
  frontendWs.on('pong', () => {
    console.log('📡 Received pong from frontend');
  });
  
  frontendWs.on('message', async (data) => {
    try {
      if (data instanceof Buffer) {
        if (openAIWs && openAIWs.readyState === WebSocket.OPEN && isInterviewActive) {
          const audioMessage = {
            type: 'input_audio_buffer.append',
            audio: data.toString('base64')
          };
          openAIWs.send(JSON.stringify(audioMessage));
        }
        return;
      }
      
      let message;
      try {
        message = JSON.parse(data.toString());
      } catch (parseError) {
        frontendWs.send(JSON.stringify({
          type: 'error',
          message: 'Invalid message format'
        }));
        return;
      }
      
      console.log('📨 Received message from frontend:', message.type);
      
      if (message.type === 'start_interview') {
        candidateContext = message.candidateContext || {};
        console.log('🎤 Starting interview for:', candidateContext.name || 'Unknown');
        console.log('📋 Candidate context:', JSON.stringify(candidateContext, null, 2));
        
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
                  }
                  break;
                  
                case 'response.audio_transcript.delta':
                  if (frontendWs.readyState === WebSocket.OPEN) {
                    frontendWs.send(JSON.stringify({
                      type: 'ai_transcription',
                      text: openAIMessage.delta,
                      is_final: false
                    }));
                  }
                  break;
                  
                case 'response.audio_transcript.done':
                  if (frontendWs.readyState === WebSocket.OPEN) {
                    frontendWs.send(JSON.stringify({
                      type: 'ai_transcription',
                      text: openAIMessage.text,
                      is_final: true
                    }));
                  }
                  break;
                  
                case 'input_audio_buffer.speech_started':
                  if (frontendWs.readyState === WebSocket.OPEN) {
                    frontendWs.send(JSON.stringify({
                      type: 'student_speech_started'
                    }));
                  }
                  break;
                  
                case 'conversation.item.input_audio_transcript.completed':
                  if (frontendWs.readyState === WebSocket.OPEN) {
                    frontendWs.send(JSON.stringify({
                      type: 'student_transcription',
                      text: openAIMessage.transcript,
                      is_final: true
                    }));
                  }
                  break;
                  
                case 'error':
                  console.error('❌ OpenAI error:', openAIMessage);
                  if (frontendWs.readyState === WebSocket.OPEN) {
                    frontendWs.send(JSON.stringify({
                      type: 'error',
                      message: openAIMessage.error?.message || 'OpenAI API error'
                    }));
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
            console.log('✓ OpenAI connection closed');
            isInterviewActive = false;
            if (frontendWs.readyState === WebSocket.OPEN) {
              frontendWs.send(JSON.stringify({
                type: 'interview_ended'
              }));
            }
          });
          
          // Send interview_started immediately - AI will start speaking after session.updated
          console.log('📤 Sending interview_started message to frontend...');
          if (frontendWs.readyState === WebSocket.OPEN) {
            frontendWs.send(JSON.stringify({
              type: 'interview_started',
              message: 'Interview session started successfully'
            }));
            console.log('✅ interview_started message sent');
          } else {
            console.error('❌ Frontend WebSocket not open, cannot send interview_started');
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
        console.log('🛑 Ending interview session');
        isInterviewActive = false;
        if (openAIWs && openAIWs.readyState === WebSocket.OPEN) {
          openAIWs.close();
        }
        frontendWs.send(JSON.stringify({
          type: 'interview_ended',
          message: 'Interview session ended'
        }));
      } else if (message.type === 'audio_chunk' && message.audio) {
        if (openAIWs && openAIWs.readyState === WebSocket.OPEN && isInterviewActive) {
          const audioMessage = {
            type: 'input_audio_buffer.append',
            audio: message.audio
          };
          openAIWs.send(JSON.stringify(audioMessage));
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
  
  frontendWs.on('close', () => {
    console.log('✓ Frontend WebSocket disconnected');
    if (pingInterval) clearInterval(pingInterval);
    if (openAIWs && openAIWs.readyState === WebSocket.OPEN) {
      openAIWs.close();
    }
    isInterviewActive = false;
  });
  
  frontendWs.on('error', (error) => {
    console.error('❌ Frontend WebSocket error:', error);
    if (pingInterval) clearInterval(pingInterval);
    if (openAIWs && openAIWs.readyState === WebSocket.OPEN) {
      openAIWs.close();
    }
  });
  
  frontendWs.send(JSON.stringify({
    type: 'connected',
    message: 'Connected to voice interview server. Send "start_interview" to begin.'
  }));
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

