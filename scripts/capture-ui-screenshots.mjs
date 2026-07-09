/**
 * Capture full-page screenshots of every UI screen for before/after redesign reference.
 *
 * Usage (from repo root, with frontend dev server running on :5173):
 *   node scripts/capture-ui-screenshots.mjs
 *
 * Optional env:
 *   UI_SCREENSHOT_BASE_URL=http://127.0.0.1:5173
 *   UI_SCREENSHOT_OUT_DIR=ui-screenshots/before-2026-07-09
 */

import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(__dirname, "..");

const BASE_URL = process.env.UI_SCREENSHOT_BASE_URL || "http://127.0.0.1:5173";
const OUT_DIR = resolve(
  ROOT,
  process.env.UI_SCREENSHOT_OUT_DIR || `ui-screenshots/before-${new Date().toISOString().slice(0, 10)}`
);

const MOCK_USER = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "screenshot@localhost.test",
  fullName: "Screenshot User",
};

const MOCK_TOKEN = "screenshot-local-dev-token";

async function waitForApp(page) {
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(900);
}

async function screenshot(page, name, label) {
  const file = join(OUT_DIR, name);
  await page.screenshot({ path: file, fullPage: true });
  return { file, name, label };
}

async function clearAuth(page) {
  await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("user");
    localStorage.removeItem("candidate_context");
  });
}

async function seedAuth(page) {
  await page.addInitScript(
    ({ user, token }) => {
      localStorage.setItem("auth_token", token);
      localStorage.setItem("user", JSON.stringify(user));
    },
    { user: MOCK_USER, token: MOCK_TOKEN }
  );
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const captured = [];

  // --- Auth screens (no login required) ---
  await clearAuth(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForApp(page);
  captured.push(await screenshot(page, "01-auth-login.png", "Auth — Sign in"));

  await page.getByTestId("button-toggle-mode").click();
  await waitForApp(page);
  captured.push(await screenshot(page, "02-auth-signup.png", "Auth — Sign up"));

  // --- Authenticated home flow ---
  await context.close();
  const authedContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const authedPage = await authedContext.newPage();
  await seedAuth(authedPage);
  await authedPage.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
  await waitForApp(authedPage);
  captured.push(await screenshot(authedPage, "03-role-selection.png", "Home — Role selection"));

  await authedPage.getByTestId("button-begin-interview").click({ force: true });
  await waitForApp(authedPage);
  captured.push(await screenshot(authedPage, "04-resume-upload.png", "Home — Resume upload"));

  await authedPage.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
  await waitForApp(authedPage);
  await authedPage.getByTestId("button-view-history").click({ force: true });
  await waitForApp(authedPage);
  captured.push(await screenshot(authedPage, "05-session-history.png", "Home — Session history"));

  // --- Results demos (no auth) ---
  const resultsPage = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  await resultsPage.goto(
    `${BASE_URL}/results?mock=true&interviewId=demo&demo=true`,
    { waitUntil: "domcontentloaded" }
  );
  await waitForApp(resultsPage);
  captured.push(await screenshot(resultsPage, "06-results-tech-demo.png", "Results — Tech demo"));

  await resultsPage.goto(
    `${BASE_URL}/results?mock=true&interviewId=demo&demo=business`,
    { waitUntil: "domcontentloaded" }
  );
  await waitForApp(resultsPage);
  captured.push(await screenshot(resultsPage, "07-results-business-demo.png", "Results — Business demo"));

  // --- Interview preview (all conversation modes) ---
  const previewPage = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  await previewPage.goto(`${BASE_URL}/interview-preview`, { waitUntil: "domcontentloaded" });
  await waitForApp(previewPage);
  captured.push(await screenshot(previewPage, "08-interview-preview-idle.png", "Interview preview — Idle"));

  const previewModes = [
    ["listening", "09-interview-preview-listening.png", "Interview preview — Listening"],
    ["user_speaking", "10-interview-preview-user-speaking.png", "Interview preview — User speaking"],
    ["ai_speaking", "11-interview-preview-ai-speaking.png", "Interview preview — AI speaking"],
    ["processing", "12-interview-preview-processing.png", "Interview preview — Processing"],
  ];

  for (const [mode, fileName, label] of previewModes) {
    await previewPage.getByRole("button", { name: new RegExp(mode.replaceAll("_", " "), "i") }).click({ force: true });
    await waitForApp(previewPage);
    captured.push(await screenshot(previewPage, fileName, label));
  }

  // --- 404 ---
  await resultsPage.goto(`${BASE_URL}/this-route-does-not-exist`, { waitUntil: "domcontentloaded" });
  await waitForApp(resultsPage);
  captured.push(await screenshot(resultsPage, "13-not-found.png", "404 — Page not found"));

  await browser.close();

  const manifest = {
    capturedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    viewport: "1440x900",
    screens: captured.map(({ file, name, label }) => ({
      file: name,
      label,
      path: file,
    })),
  };

  const manifestPath = join(OUT_DIR, "manifest.json");
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>UI Screenshots — Before</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem; background: #f8fafc; color: #0f172a; }
    h1 { margin-bottom: 0.25rem; }
    p.meta { color: #64748b; margin-top: 0; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 1.5rem; margin-top: 2rem; }
    figure { margin: 0; background: white; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(15,23,42,.08); }
    figcaption { padding: 0.75rem 1rem; font-weight: 600; font-size: 0.95rem; border-top: 1px solid #e2e8f0; }
    img { display: block; width: 100%; height: auto; }
    a { color: #2563eb; }
  </style>
</head>
<body>
  <h1>UI Screenshots (Before)</h1>
  <p class="meta">Captured ${manifest.capturedAt} · ${manifest.viewport} · <a href="manifest.json">manifest.json</a></p>
  <div class="grid">
    ${manifest.screens
      .map(
        (s) => `<figure><a href="${s.file}"><img src="${s.file}" alt="${s.label}" loading="lazy" /></a><figcaption>${s.label}</figcaption></figure>`
      )
      .join("\n    ")}
  </div>
</body>
</html>`;

  const indexPath = join(OUT_DIR, "index.html");
  await writeFile(indexPath, indexHtml, "utf8");

  console.log(`\nCaptured ${captured.length} screenshots in:\n  ${OUT_DIR}\n`);
  for (const { name, label } of captured) {
    console.log(`  ✓ ${name} — ${label}`);
  }
  console.log(`\nOpen gallery: file://${indexPath.replace(/\\/g, "/")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
