/**
 * Dialogflow CX Webhook for Interview Questions
 * 
 * Entry Point: dialogflowWebhook
 * 
 * How the "Interview" tag is resolved:
 * - If tag="Interview", check sessionInfo.parameters.next_page
 * - If next_page is a valid section, use it
 * - Otherwise, randomly select from remaining sections (excluding completed_sections)
 * - If all sections are complete, resolve to "Closing"
 * 
 * What to expect in logs:
 * - One JSON line per request: {tag, page, major, countsSummary, chosenSection, chosenQuestionLength}
 * - One JSON line per error: {level:"error", message, stackExists:true}
 * 
 * How to run tests: npm test
 * 
 * How to run locally: npm start (starts on port 8080)
 */

const functions = require('@google-cloud/functions-framework');
const express = require('express');

const app = express();

// Middleware for parsing JSON
app.use(express.json());

// Interview sections in order
const sections = [
  "Interest and Motivation",
  "Academic Experience",
  "Transferable Skills",
  "Behavioral Questions",
  "Technical Questions"
];

/**
 * Resolves "Interview" tag to a concrete section
 * @param {string} tag - The tag from fulfillmentInfo
 * @param {object} params - sessionInfo.parameters
 * @returns {string} - Resolved section name or original tag
 */
function resolveInterviewTag(tag, params) {
  if (tag !== "Interview") return tag;
  
  const next = params?.next_page;
  if (sections.includes(next)) return next;
  
  const done = new Set(params?.completed_sections || []);
  const remaining = sections.filter(s => !done.has(s));
  return remaining.length ? remaining[Math.floor(Math.random() * remaining.length)] : "Closing";
}

/**
 * Logs request summary in JSON format
 */
function logRequestSummary(tag, page, major, countsSummary, chosenSection, chosenQuestionLength) {
  console.log(JSON.stringify({
    tag,
    page: page || null,
    major: major || "missing",
    countsSummary,
    chosenSection,
    chosenQuestionLength
  }));
}

/**
 * Logs error in JSON format
 */
function logError(message, error) {
  console.error(JSON.stringify({
    level: "error",
    message,
    stackExists: !!error?.stack
  }));
  if (error?.stack) {
    console.error(error.stack);
  }
}

const dialogflowWebhook = (req, res) => {
  try {
    // Extract tag - try multiple locations
    let tag = req.body.fulfillmentInfo?.tag;
    
    if (!tag) {
      tag = req.body.pageInfo?.currentPage?.displayName;
    }
    
    if (!tag) {
      tag = req.body.detectIntentResponse?.pageInfo?.currentPage?.displayName;
    }
    
    if (!tag) {
      tag = req.query.tag || req.headers['x-dialogflow-tag'];
    }
    
    // If still no tag, default to "Interview" (as per requirements)
    if (!tag) {
      tag = "Interview";
    }
    
    const params = req.body.sessionInfo?.parameters || {};
    const page = req.body.pageInfo?.currentPage?.displayName || null;
    
    // Store original tag for logging
    const originalTag = tag;
    
    // Resolve "Interview" tag to concrete section
    const resolvedTag = resolveInterviewTag(tag, params);
    tag = resolvedTag;
    
    // Get major - must be present for Technical Questions
    let major = params.major;
    const majorTrimmed = typeof major === 'string' ? major.trim() : '';
    const majorMissing = !major || majorTrimmed === '';
    
    // Get session state
    const sectionQuestionCount = params.section_question_count || {};
    const completedSections = Array.isArray(params.completed_sections) ? params.completed_sections : [];
    const askedQuestions = Array.isArray(params.asked_questions) ? params.asked_questions : [];
    
    // Trim asked_questions to last 100 to keep payload small
    const MAX_ASKED_QUESTIONS = 100;
    const trimmedAskedQuestions = askedQuestions.slice(-MAX_ASKED_QUESTIONS);
    
    // Counts summary for logging
    const countsSummary = {
      sectionCounts: Object.keys(sectionQuestionCount).length,
      completedSections: completedSections.length,
      askedQuestions: trimmedAskedQuestions.length
    };
    
    // Check for missing major - only block if we're in a section that needs it
    // Actually, per requirements: if major missing, return prompt and stop state advancement
    if (majorMissing) {
      logRequestSummary(originalTag, page, null, countsSummary, resolvedTag, 0);
      return res.status(200).json({
        fulfillment_response: {
          messages: [{
            text: {
              text: ["I'd like to know what your major is. Could you please tell me your major?"]
            }
          }]
        },
        session_info: {
          parameters: {
            ...params,
            // Don't advance state
            section_question_count: sectionQuestionCount,
            completed_sections: completedSections,
            asked_questions: trimmedAskedQuestions
          }
        }
      });
    }
    
    major = majorTrimmed || "General";
    
    // Question configuration
    const questionsPerSection = {
      "Interest and Motivation": 1,
      "Academic Experience": 1,
      "Transferable Skills": 1,
      "Behavioral Questions": 2,
      "Technical Questions": 2
    };
    
    const questionSets = {
      "Interest and Motivation": [
        "What motivated you to pursue a career in this field?",
        "Why are you interested in this internship or entry-level role?",
        "What inspired your interest in technology or information systems?",
        "Can you tell me what excites you most about working in tech?"
      ],
      "Academic Experience": [
        "Can you walk me through a project from class that challenged you?",
        "What's a technical concept from your coursework you've found most valuable?",
        "How do you approach learning new topics in your major?",
        "Describe a time when you had to troubleshoot something in a school project.",
        "Tell me about your most memorable assignment and what made it stand out."
      ],
      "Transferable Skills": [
        "Can you describe a situation where you worked as part of a team?",
        "What's one thing you learned from a part-time job that applies to tech?",
        "Tell me about a time you had to learn something new quickly.",
        "How do you handle juggling multiple priorities, like classes and work?",
        "Describe how you've developed your communication skills."
      ],
      "Behavioral Questions": [
        "You're in a group project and a teammate isn't contributing. What do you do?",
        "Tell me about a time you faced a setback and how you handled it.",
        "If your manager gave you feedback you disagreed with, how would you respond?",
        "Describe a situation where you had to meet a tight deadline.",
        "Tell me about a time you had to resolve a conflict with a peer.",
        "Give me an example of when you showed leadership, even in a small way.",
        "Describe a situation where you had to adapt to unexpected changes.",
        "Tell me about a time you failed at something and what you learned."
      ],
      "Technical Questions": {
        "Cybersecurity": [
          "What's the difference between symmetric and asymmetric encryption?",
          "How would you identify a phishing attempt?",
          "Explain the CIA triad in cybersecurity.",
          "What security measures would you implement for a new web application?",
          "Describe how a firewall works and why it's important.",
          "What's the difference between a virus and a worm?",
          "How would you respond to a suspected data breach?",
          "Explain what two-factor authentication is and why it matters."
        ],
        "Computer Information Systems": [
          "How would you explain the role of databases in business?",
          "Describe a system or app you've worked on in school.",
          "What steps would you take to troubleshoot a technical issue?",
          "How do information systems help businesses make better decisions?",
          "Explain the difference between a database and a spreadsheet.",
          "How would you ensure data accuracy in a business system?",
          "What's your understanding of cloud computing?",
          "Describe how you would gather requirements for a new system."
        ],
        "Computer Science": [
          "Explain the difference between a stack and a queue.",
          "What's your experience with version control systems like Git?",
          "How would you optimize a slow-running program?",
          "Tell me about your favorite data structure and why.",
          "What's the difference between object-oriented and functional programming?",
          "Explain what an API is in simple terms.",
          "How would you approach debugging a complex program?",
          "Describe your experience with any programming languages."
        ],
        "General": [
          "What technology interests you most and why?",
          "How do you stay updated on new developments in your field?",
          "Describe a technical problem you solved recently.",
          "What programming or technical tools are you most comfortable with?"
        ]
      },
      "Closing": [
        "What questions do you have for me about this position?",
        "Is there anything else you'd like to share before we finish?",
        "What are your career goals for the next 2-3 years?"
      ]
    };
    
    const transitions = [
      "That's helpful. Let me shift gears—",
      "Interesting. I'd also like to explore—",
      "Thanks for sharing. Now I'm curious about—",
      "Great. Let's talk about something different—",
      "Appreciate that context. Moving on—"
    ];
    
    const followUps = [
      "And here's a follow-up—",
      "Let me dig a bit deeper—",
      "Building on that—",
      "One more question on this topic—",
      "And another thing I'd like to know—"
    ];
    
    let question = "";
    let nextPage = "";
    let chosenSection = tag;
    let dedupOverflow = false;
    
    // Handle Technical Questions with major-specific sub-categories
    if (tag === "Technical Questions") {
      const techQs = questionSets[tag][major] || questionSets[tag]["General"];
      
      if (!techQs || techQs.length === 0) {
        // Known-good fallback: use General pool
        const generalQs = questionSets[tag]["General"] || [];
        if (generalQs.length > 0) {
          logError("Technical Questions array empty for major, using General", new Error(`Major: ${major}`));
          const availableQs = generalQs.filter(q => !trimmedAskedQuestions.includes(q));
          question = availableQs.length > 0 
            ? availableQs[Math.floor(Math.random() * availableQs.length)] 
            : generalQs[Math.floor(Math.random() * generalQs.length)];
          if (!availableQs.length && generalQs.length > 0) {
            dedupOverflow = true;
          }
        } else {
          // Still empty - return graceful error
          logRequestSummary(originalTag, page, major, countsSummary, chosenSection, 0);
          return res.status(200).json({
            fulfillment_response: {
              messages: [{
                text: {
                  text: ["I'm sorry, there was an error loading questions. Please try again."]
                }
              }]
            },
            session_info: {
              parameters: {
                ...params,
                section_question_count: sectionQuestionCount,
                completed_sections: completedSections,
                asked_questions: trimmedAskedQuestions,
                major: major
              }
            }
          });
        }
      } else {
        const availableQs = techQs.filter(q => !trimmedAskedQuestions.includes(q));
        question = availableQs.length > 0 
          ? availableQs[Math.floor(Math.random() * availableQs.length)] 
          : techQs[Math.floor(Math.random() * techQs.length)];
        if (!availableQs.length && techQs.length > 0) {
          dedupOverflow = true;
        }
      }
    }
    // Handle Closing section
    else if (tag === "Closing") {
      const closingQs = questionSets[tag];
      
      if (!Array.isArray(closingQs) || closingQs.length === 0) {
        logRequestSummary(originalTag, page, major, countsSummary, chosenSection, 0);
        return res.status(200).json({
          fulfillment_response: {
            messages: [{
              text: {
                text: ["I'm sorry, there was an error loading questions. Please try again."]
              }
            }]
          },
          session_info: {
            parameters: {
              ...params,
              section_question_count: sectionQuestionCount,
              completed_sections: completedSections,
              asked_questions: trimmedAskedQuestions,
              major: major
            }
          }
        });
      }
      
      const availableQs = closingQs.filter(q => !trimmedAskedQuestions.includes(q));
      question = availableQs.length > 0 
        ? availableQs[Math.floor(Math.random() * availableQs.length)] 
        : closingQs[Math.floor(Math.random() * closingQs.length)];
      if (!availableQs.length && closingQs.length > 0) {
        dedupOverflow = true;
      }
      
      // For closing, we don't need to update section counts or determine next page
      const updatedAskedQuestions = [...trimmedAskedQuestions, question].slice(-MAX_ASKED_QUESTIONS);
      
      logRequestSummary(originalTag, page, major, countsSummary, chosenSection, question.length);
      if (dedupOverflow) {
        console.warn(JSON.stringify({ dedupOverflow: true, section: tag }));
      }
      
      return res.status(200).json({
        fulfillment_response: {
          messages: [{
            text: {
              text: [question]
            }
          }]
        },
        session_info: {
          parameters: {
            ...params,
            section_question_count: sectionQuestionCount,
            completed_sections: completedSections,
            next_page: "Closing",
            asked_questions: updatedAskedQuestions,
            major: major
          }
        }
      });
    }
    // Handle other sections
    else if (questionSets[tag] && Array.isArray(questionSets[tag])) {
      const sectionQs = questionSets[tag];
      
      if (sectionQs.length === 0) {
        // Known-good fallback: use a default pool (Interest and Motivation as safe default)
        const defaultQs = questionSets["Interest and Motivation"] || [];
        if (defaultQs.length > 0) {
          logError(`Section ${tag} array empty, using fallback`, new Error(`Tag: ${tag}`));
          const availableQs = defaultQs.filter(q => !trimmedAskedQuestions.includes(q));
          question = availableQs.length > 0 
            ? availableQs[Math.floor(Math.random() * availableQs.length)] 
            : defaultQs[Math.floor(Math.random() * defaultQs.length)];
          if (!availableQs.length && defaultQs.length > 0) {
            dedupOverflow = true;
          }
        } else {
          logRequestSummary(originalTag, page, major, countsSummary, chosenSection, 0);
          return res.status(200).json({
            fulfillment_response: {
              messages: [{
                text: {
                  text: ["I'm sorry, there was an error loading questions. Please try again."]
                }
              }]
            },
            session_info: {
              parameters: {
                ...params,
                section_question_count: sectionQuestionCount,
                completed_sections: completedSections,
                asked_questions: trimmedAskedQuestions,
                major: major
              }
            }
          });
        }
      } else {
        const availableQs = sectionQs.filter(q => !trimmedAskedQuestions.includes(q));
        question = availableQs.length > 0 
          ? availableQs[Math.floor(Math.random() * availableQs.length)] 
          : sectionQs[Math.floor(Math.random() * sectionQs.length)];
        if (!availableQs.length && sectionQs.length > 0) {
          dedupOverflow = true;
        }
      }
    } else {
      // Unknown tag - log it and proceed via resolver (shouldn't happen if resolver works, but handle gracefully)
      logError(`Unknown tag received: ${tag}, attempting to resolve`, new Error(`Tag: ${tag}`));
      // Try to resolve again or use a default section
      const fallbackTag = sections[0] || "Interest and Motivation";
      chosenSection = fallbackTag;
      
      if (questionSets[fallbackTag] && Array.isArray(questionSets[fallbackTag])) {
        const fallbackQs = questionSets[fallbackTag];
        const availableQs = fallbackQs.filter(q => !trimmedAskedQuestions.includes(q));
        question = availableQs.length > 0 
          ? availableQs[Math.floor(Math.random() * availableQs.length)] 
          : fallbackQs[Math.floor(Math.random() * fallbackQs.length)];
        if (!availableQs.length && fallbackQs.length > 0) {
          dedupOverflow = true;
        }
        tag = fallbackTag; // Update tag for state tracking
      } else {
        // Last resort
        logRequestSummary(originalTag, page, major, countsSummary, chosenSection, 0);
        return res.status(200).json({
          fulfillment_response: {
            messages: [{
              text: {
                text: ["I'm sorry, I encountered an unexpected error. Let's continue."]
              }
            }]
          },
          session_info: {
            parameters: {
              ...params,
              section_question_count: sectionQuestionCount,
              completed_sections: completedSections,
              asked_questions: trimmedAskedQuestions,
              major: major
            }
          }
        });
      }
    }
    
    // Update asked questions
    const updatedAskedQuestions = [...trimmedAskedQuestions, question].slice(-MAX_ASKED_QUESTIONS);
    
    // Initialize section count if needed
    if (!sectionQuestionCount[tag]) {
      sectionQuestionCount[tag] = 0;
    }
    
    sectionQuestionCount[tag] = sectionQuestionCount[tag] + 1;
    const targetQuestions = questionsPerSection[tag] || 1;
    const currentCount = sectionQuestionCount[tag];
    
    const updatedCompletedSections = [...completedSections];
    
    // Determine next page and add transitions/follow-ups
    if (currentCount < targetQuestions) {
      // Still more questions in this section
      nextPage = tag;
      
      if (currentCount > 1) {
        // Add follow-up transition for subsequent questions in same section (not the first one)
        const randomFollowUp = followUps[Math.floor(Math.random() * followUps.length)];
        question = randomFollowUp + " " + question;
      }
    } else {
      // Section is complete
      if (!updatedCompletedSections.includes(tag)) {
        updatedCompletedSections.push(tag);
      }
      
      // Find remaining sections
      const remainingSections = sections.filter(section => !updatedCompletedSections.includes(section));
      
      if (remainingSections.length > 0) {
        // Move to next random section
        const randomIndex = Math.floor(Math.random() * remainingSections.length);
        nextPage = remainingSections[randomIndex];
        
        const randomTransition = transitions[Math.floor(Math.random() * transitions.length)];
        question = randomTransition + " " + question;
      } else {
        // All sections complete, move to closing
        nextPage = "Closing";
        
        const randomTransition = transitions[Math.floor(Math.random() * transitions.length)];
        question = randomTransition + " " + question;
      }
    }
    
    // Log request summary
    logRequestSummary(resolvedTag, page, major, countsSummary, chosenSection, question.length);
    if (dedupOverflow) {
      console.warn(JSON.stringify({ dedupOverflow: true, section: tag }));
    }
    
    // Return response with updated session parameters
    return res.status(200).json({
      fulfillment_response: {
        messages: [{
          text: {
            text: [question]
          }
        }]
      },
      session_info: {
        parameters: {
          ...params,
          section_question_count: sectionQuestionCount,
          completed_sections: updatedCompletedSections,
          next_page: nextPage,
          asked_questions: updatedAskedQuestions,
          major: major
        }
      }
    });
    
  } catch (error) {
    logError('Error in dialogflowWebhook', error);
    // Always return 200 with valid Dialogflow format, even on errors
    return res.status(200).json({
      fulfillment_response: {
        messages: [{
          text: {
            text: ["I'm sorry, I encountered an error. Please try again."]
          }
        }]
      },
      session_info: {
        parameters: req.body?.sessionInfo?.parameters || {}
      }
    });
  }
};

// Handle all HTTP methods - Dialogflow CX uses POST
app.post('*', dialogflowWebhook);
app.put('*', dialogflowWebhook);
app.patch('*', dialogflowWebhook);

// GET handler for health checks
app.get('*', (req, res) => {
  if (req.path === '/health' || req.path === '/') {
    return res.status(200).json({
      status: 'ok'
    });
  }
  res.status(405).json({
    error: 'Method not allowed. This webhook only accepts POST requests.'
  });
});

// Error handling middleware (must be after routes)
app.use((err, req, res, next) => {
  logError('Express error', err);
  // Always return 200 with valid Dialogflow format for Dialogflow CX compatibility
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(200).json({
      fulfillment_response: {
        messages: [{
          text: {
            text: ["I'm sorry, there was an error parsing your request. Please try again."]
          }
        }]
      },
      session_info: {
        parameters: req.body?.sessionInfo?.parameters || {}
      }
    });
  }
  // For other errors, return generic error response with 200 status
  return res.status(200).json({
    fulfillment_response: {
      messages: [{
        text: {
          text: ["I'm sorry, I encountered an error. Please try again."]
        }
      }]
    },
    session_info: {
      parameters: req.body?.sessionInfo?.parameters || {}
    }
  });
});

// Export the Express app as the HTTP function
// The entry point name should match what you configure in Cloud Run
functions.http('dialogflowWebhook', app);
