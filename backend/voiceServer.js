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
   - BEHAVIORAL QUESTIONS (40-60%): Focus on soft skills critical for entry-level roles:
     * Teamwork and collaboration (group projects, study groups)
     * Adaptability and learning ability (handling new challenges, learning from mistakes)
     * Time management and organization (balancing coursework, activities)
     * Communication skills (presentations, group discussions)
     * Problem-solving approach (academic challenges, personal projects)
     * Initiative and self-direction (independent learning, personal projects)
   
   - TECHNICAL/DOMAIN QUESTIONS (40-60%): Tailored EXCLUSIVELY to their major:
${majorCategory === 'computer_science' ? `     * Computer Science: Basic to intermediate programming concepts, algorithms, data structures, software development principles, debugging, version control, common programming languages (Python, Java, JavaScript), object-oriented programming, basic system design
     * AVOID: Finance, business, or non-CS technical questions` : ''}
${majorCategory === 'finance' ? `     * Finance: Financial principles, accounting basics, financial modeling concepts, market analysis, risk assessment, financial statements, investment basics, Excel skills
     * AVOID: Programming, algorithms, or non-finance technical questions` : ''}
${majorCategory === 'engineering' ? `     * Engineering: Basic problem-solving, design principles, engineering fundamentals relevant to their discipline (mechanical/electrical/civil/etc.), technical analysis, CAD or relevant tools, safety principles
     * AVOID: Questions outside their engineering discipline or unrelated technical domains` : ''}
${majorCategory === 'business' ? `     * Business: Communication skills, market knowledge, basic analytics, leadership potential, business strategy basics, customer relations, project management basics
     * AVOID: Deep technical programming or engineering questions` : ''}
${majorCategory === 'psychology' ? `     * Psychology: Research methods, behavioral concepts, data analysis, experimental design, statistical concepts, psychological theories, applicable analytical skills
     * AVOID: Programming, finance, or engineering-specific questions` : ''}
${majorCategory === 'general' ? `     * General: Foundational questions appropriate for entry-level positions in ${major || 'their field'}, basic concepts, transferable skills, learning approach` : ''}

5. MAJOR-SPECIFIC GUIDELINES:
   - REMEMBER their major throughout the conversation: ${major || 'their field'}
   - NEVER ask questions outside their domain expertise (e.g., don't ask CS majors about finance, don't ask finance majors about programming)
   - Adjust technical depth based on their responses - if they struggle, simplify; if they excel, go deeper
   - For less technical majors, lean MORE heavily on behavioral questions (60-70% behavioral)
   - For technical majors, maintain better balance (50-50 or 60% technical, 40% behavioral)

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
   - Start with foundational questions to gauge their level
   - Adjust difficulty based on responses: easier if struggling, more challenging if excelling
   - If they have strong technical background, include more technical depth
   - If they're newer to the field, focus more on potential and learning ability
   - Balance is key - don't overwhelm, but don't undersell their capabilities

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
   - Their year: ${year || 'their academic level'} - adjust expectations accordingly

REMEMBER: Your goal is to help them PREPARE for real interviews while assessing their potential. Make this a positive, confidence-building experience that helps them learn and grow. Be their advocate, not their critic.`;
}

function createOpenAIConnection(apiKey, systemPrompt) {
  return new Promise((resolve, reject) => {
    console.log('🔌 Connecting to OpenAI Realtime API...');
    
    const ws = new WebSocket(`${OPENAI_REALTIME_API_URL}?model=${OPENAI_MODEL}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'OpenAI-Beta': 'realtime=v1'
      }
    });
    
    ws.on('open', () => {
      console.log('✓ Connected to OpenAI Realtime API');
      
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
      resolve(ws);
    });
    
    ws.on('error', (error) => {
      console.error('❌ OpenAI WebSocket error:', error);
      reject(error);
    });
    
    ws.on('close', (code, reason) => {
      console.log(`✓ OpenAI WebSocket closed: ${code} - ${reason.toString()}`);
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
        
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
          throw new Error('OPENAI_API_KEY environment variable is not set');
        }
        
        const systemPrompt = createSystemPrompt(candidateContext);
        
        try {
          openAIWs = await createOpenAIConnection(apiKey, systemPrompt);
          isInterviewActive = true;
          
          openAIWs.on('message', (openAIData) => {
            try {
              const openAIMessage = JSON.parse(openAIData.toString());
              
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
          
          frontendWs.send(JSON.stringify({
            type: 'interview_started',
            message: 'Interview session started successfully'
          }));
          
        } catch (error) {
          console.error('❌ Failed to connect to OpenAI:', error);
          frontendWs.send(JSON.stringify({
            type: 'error',
            message: `Failed to start interview: ${error.message}`
          }));
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
    perMessageDeflate: false
  });
  
  wss.on('connection', (ws, req) => {
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

