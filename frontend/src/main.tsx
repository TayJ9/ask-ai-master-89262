// Import React synchronously first to ensure it's available before any lazy components
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { devLog } from "./lib/utils";
import "./index.css";

// Verify root element exists
const rootElement = document.getElementById("root");
if (!rootElement) {
  console.error("Root element not found!");
  throw new Error("Root element '#root' not found in the DOM");
}

devLog.log("[App] Starting React app render");
devLog.log("[App] React version:", React.version);
devLog.log("[App] Root element:", rootElement);

// Verify React.Children is available before proceeding
if (!React.Children) {
  const error = new Error("React.Children is not available. React may not be fully initialized.");
  console.error("[App] React initialization check failed:", error);
  rootElement.innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; padding: 2rem; text-align: center; font-family: system-ui, -apple-system, sans-serif;">
      <h1 style="color: #dc2626; margin-bottom: 1rem;">React Initialization Error</h1>
      <p style="color: #666; margin-bottom: 2rem;">React is not fully initialized. Please refresh the page.</p>
      <button onclick="window.location.reload()" style="padding: 0.5rem 1rem; background: #2563eb; color: white; border: none; border-radius: 0.375rem; cursor: pointer;">
        Reload Page
      </button>
    </div>
  `;
  throw error;
}

devLog.log("[App] React.Children check passed - React is ready");

try {
  const root = createRoot(rootElement);
  devLog.log("[App] Root created, rendering App component...");
  root.render(<App />);
  devLog.log("[App] React app rendered successfully");
} catch (error) {
  console.error("[App] Failed to render React app:", error);
  // Show a user-friendly error message
  rootElement.innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; padding: 2rem; text-align: center; font-family: system-ui, -apple-system, sans-serif;">
      <h1 style="color: #dc2626; margin-bottom: 1rem;">Application Error</h1>
      <p style="color: #666; margin-bottom: 2rem;">Failed to load the application. Please refresh the page.</p>
      <button onclick="window.location.reload()" style="padding: 0.5rem 1rem; background: #2563eb; color: white; border: none; border-radius: 0.375rem; cursor: pointer;">
        Reload Page
      </button>
      <details style="margin-top: 2rem; text-align: left; max-width: 600px;">
        <summary style="cursor: pointer; color: #666;">Error Details</summary>
        <pre style="background: #f3f4f6; padding: 1rem; border-radius: 0.375rem; overflow: auto; margin-top: 0.5rem; font-size: 0.875rem;">
${error instanceof Error ? error.stack : String(error)}
        </pre>
      </details>
    </div>
  `;
  throw error;
}
