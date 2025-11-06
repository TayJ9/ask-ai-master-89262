import { SessionsClient } from "@google-cloud/dialogflow-cx";
import { protos } from "@google-cloud/dialogflow-cx";

// Types
type QueryInput = protos.google.cloud.dialogflow.cx.v3.IQueryInput;
type DetectIntentRequest = protos.google.cloud.dialogflow.cx.v3.IDetectIntentRequest;

// Load credentials from environment variable
function getCredentials() {
  const credentialsJson = process.env.GOOGLE_CREDENTIALS;
  if (!credentialsJson) {
    throw new Error("GOOGLE_CREDENTIALS environment variable not set. Please add your service account JSON key to Replit Secrets.");
  }
  
  try {
    return JSON.parse(credentialsJson);
  } catch (error) {
    throw new Error("Failed to parse GOOGLE_CREDENTIALS. Make sure it's valid JSON.");
  }
}

// Get Dialogflow configuration from environment
function getDialogflowConfig() {
  const projectId = process.env.DIALOGFLOW_PROJECT_ID;
  const locationId = process.env.DIALOGFLOW_LOCATION_ID || "us-central1";
  const agentId = process.env.DIALOGFLOW_AGENT_ID;
  const languageCode = process.env.DIALOGFLOW_LANGUAGE_CODE || "en";

  if (!projectId) {
    throw new Error("DIALOGFLOW_PROJECT_ID environment variable not set.");
  }
  if (!agentId) {
    throw new Error("DIALOGFLOW_AGENT_ID environment variable not set.");
  }

  return { projectId, locationId, agentId, languageCode };
}

// Create session path
function getSessionPath(sessionId: string): string {
  const { projectId, locationId, agentId } = getDialogflowConfig();
  return `projects/${projectId}/locations/${locationId}/agents/${agentId}/sessions/${sessionId}`;
}

// Initialize Dialogflow client
function createClient(): SessionsClient {
  const credentials = getCredentials();
  const { locationId } = getDialogflowConfig();

  return new SessionsClient({
    credentials,
    apiEndpoint: `${locationId}-dialogflow.googleapis.com`,
  });
}

/**
 * Start an interview session with Dialogflow CX
 * Sends initial message and custom session parameters
 */
export async function startInterviewSession(
  sessionId: string,
  roleSelection: string,
  resumeSummary: string = "",
  persona: string = "",
  difficulty: string = "Medium"
): Promise<{ agentResponse: string; sessionPath: string }> {
  const client = createClient();
  const { languageCode } = getDialogflowConfig();
  const sessionPath = getSessionPath(sessionId);

  // Define custom session parameters (these will be available in your Dialogflow agent)
  const sessionParams: Record<string, any> = {
    candidate_resume_summary: resumeSummary,
    interviewer_persona: persona,
    difficulty_level: difficulty,
  };

  // Build the query input (text input for now)
  const queryInput: QueryInput = {
    text: {
      text: roleSelection,
    },
    languageCode,
  };

  // Build the detect intent request
  const request: DetectIntentRequest = {
    session: sessionPath,
    queryInput,
    queryParams: {
      parameters: sessionParams,
    },
  };

  try {
    const [response] = await client.detectIntent(request);
    
    // Extract the agent's response text
    const responseMessages = response.queryResult?.responseMessages || [];
    let agentResponse = "";
    
    for (const message of responseMessages) {
      if (message.text?.text) {
        agentResponse = message.text.text[0] || "";
        break;
      }
    }

    if (!agentResponse) {
      agentResponse = "Thank you for your interest. Let's begin the interview.";
    }

    return {
      agentResponse,
      sessionPath,
    };
  } catch (error: any) {
    console.error("Dialogflow API error:", error);
    throw new Error(`Failed to start interview session: ${error.message}`);
  }
}

/**
 * Send a user message to Dialogflow and get agent response
 */
export async function sendMessageToDialogflow(
  sessionId: string,
  userMessage: string
): Promise<{ agentResponse: string; isComplete: boolean; intent?: string }> {
  const client = createClient();
  const { languageCode } = getDialogflowConfig();
  const sessionPath = getSessionPath(sessionId);

  const queryInput: QueryInput = {
    text: {
      text: userMessage,
    },
    languageCode,
  };

  const request: DetectIntentRequest = {
    session: sessionPath,
    queryInput,
  };

  try {
    const [response] = await client.detectIntent(request);
    
    // Extract agent response
    const responseMessages = response.queryResult?.responseMessages || [];
    let agentResponse = "";
    
    for (const message of responseMessages) {
      if (message.text?.text) {
        agentResponse = message.text.text[0] || "";
        break;
      }
    }

    // Check if interview is complete (you can customize this based on your Dialogflow agent)
    // For example, check for a specific intent or parameter
    const intent = response.queryResult?.intent?.displayName || "";
    const isComplete = intent.toLowerCase().includes("end") || 
                      intent.toLowerCase().includes("complete") ||
                      intent.toLowerCase().includes("finish");

    return {
      agentResponse: agentResponse || "I understand. Please continue.",
      isComplete,
      intent,
    };
  } catch (error: any) {
    console.error("Dialogflow API error:", error);
    throw new Error(`Failed to send message: ${error.message}`);
  }
}

/**
 * Generate a unique session ID for Dialogflow
 */
export function generateSessionId(userId: string, interviewId: string): string {
  // Use a combination of userId and interviewId to ensure uniqueness
  return `${userId}-${interviewId}-${Date.now()}`;
}

