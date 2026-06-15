// factory/buildmode.js
// /build mode — Phase 2
// Self-contained: does not depend on agent.js exports.
// Detects /build trigger, assembles full Ralph+repo+session context,
// flags session for Fred to write a build-type exit record.
// test comment

const BUILD_MODEL = "claude-opus-4-6"; // hardcoded per Council decision (Session 12)

const OPEN_ITEMS = [
 "Routing suggestion noise — analyzeAndRoute fires on conversational messages",
 "Council button CSS conflict in thread top bar",
 "Mavis self-knowledge gap in conversational mode — fabricates architecture",
 "File path protocol not structurally enforced",
 "Make it so button appearance inconsistent",
 "updated_at on mavis_config not updating on upsert (cosmetic)",
 "[PARKED] Architecture diagram (Mermaid, layer-level) — build after first /build session",
 "[PARKED] Model routing logic — revisit once multiple AI features exist"
];

function detectBuildTrigger(message) {
 const trimmed = message.trim();
 if (!trimmed.toLowerCase().startsWith("/build")) {
   return { isBuild: false, filePaths: [] };
 }
 const rest = trimmed.slice("/build".length).trim();
 const filePaths = rest.length > 0 ? rest.split(/\s+/) : [];
 return { isBuild: true, filePaths };
}

async function fetchFileContent(filePath, githubToken, repo = "daver5326/Mavis", branch = "main") {
 const url = `https://api.github.com/repos/${repo}/contents/${filePath}?ref=${branch}`;
 const res = await fetch(url, {
   headers: {
     Authorization: `token ${githubToken}`,
     Accept: "application/vnd.github.v3+json"
   }
 });
 if (!res.ok) {
   return { path: filePath, error: `Failed to fetch (${res.status})` };
 }
 const data = await res.json();
 const content = Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf-8");
 return { path: filePath, content };
}

async function fetchRecentBuildSessions(supabaseUrl, supabaseKey, limit = 10) {
 const url = `${supabaseUrl}/rest/v1/sessions?session_type=eq.build&order=created_at.desc&limit=${limit}&select=session_type,decisions_made,files_changed,next_action,created_at`;
 const res = await fetch(url, {
   headers: {
     apikey: supabaseKey,
     Authorization: `Bearer ${supabaseKey}`
   }
 });
 if (!res.ok) {
   return [];
 }
 return res.json();
}

async function assembleBuildContext({ filePaths, githubToken, supabaseUrl, supabaseKey, ralphGlobals }) {
 const fileContents = await Promise.all(
   filePaths.map((p) => fetchFileContent(p, githubToken))
 );

 const recentBuildSessions = await fetchRecentBuildSessions(supabaseUrl, supabaseKey, 10);

 return {
   model: BUILD_MODEL,
   ralphGlobals,
   requestedFiles: fileContents,
   recentBuildSessions,
   openItems: OPEN_ITEMS
 };
}

function buildModeSystemPrompt(context) {
 const fileBlocks = context.requestedFiles
   .map((f) =>
     f.error
       ? `--- FILE: ${f.path} (ERROR: ${f.error}) ---`
       : `--- FILE: ${f.path} ---\n${f.content}`
   )
   .join("\n\n");

 const sessionBlocks = context.recentBuildSessions
   .map(
     (s) =>
       `[${s.created_at}] decisions: ${s.decisions_made || "—"} | files: ${
         s.files_changed || "—"
       } | next: ${s.next_action || "—"}`
   )
   .join("\n");

 const openItemsBlock = context.openItems.map((i) => `- ${i}`).join("\n");

 return `
=== /build MODE ACTIVE ===
Model: ${context.model}

CONTEXT: You are in Mavis self-development mode. "Mavis" is the AI development
system David is building — the factory itself, including this chat interface,
its routing, its agents, and its memory architecture. This is NOT one of
David's other project threads (Ripple, Wingsuit, Musician Hero) — those are
separate apps Mavis will eventually help build, but they are not in scope here.

The LIVING DOCUMENT SUMMARY below may reference those other projects (Ripple,
etc.) because it's shared across all of Mavis's contexts — treat that as
background only. Your job in this session is to read and reason about Mavis's
own codebase (the files below) and propose changes to Mavis itself.

CRITICAL RULE — UNKNOWN FILES:
If a file is NOT present in your REQUESTED FILES block below, you cannot see
its contents. Do not infer, reconstruct, or assume what it contains. State
explicitly: "I don't have [filename] in context — please fetch it before I
propose changes to it."

CRITICAL RULE — NO TOOLS:
You do not have access to any tools. Do not attempt to call readFile, fetchFile,
or any other tool or function. All file contents you need are already provided
in the REQUESTED FILES block below — they were fetched before this session
started. When a change is approved, output the complete modified file as a
code block so Mavis can commit it directly.
NOTE: This constraint exists because the tool layer is not yet fully built.
In a future version of Mavis, you will have real readFile/writeFile tools
and this instruction will be removed.

LIVING DOCUMENT SUMMARY (general Mavis context, may include other-project mentions):
${context.ralphGlobals._livingDocSummary || "(none loaded)"}

REPO MAP:
${JSON.stringify(context.ralphGlobals._repoMap || {}, null, 2)}

REQUESTED FILES (FULL CONTENT):
${fileBlocks || "(none requested)"}

LAST ${context.recentBuildSessions.length} BUILD SESSIONS:
${sessionBlocks || "(none yet — this may be the first)"}

OPEN / PARKED ITEMS:
${openItemsBlock}

Working protocol: full file replacements for large files, one file at a time,
full path before every edit.

PROPOSAL AND CONFIRMATION PROTOCOL (mandatory, no exceptions):
Every response that proposes a code change MUST end with this exact block:

---
**If you approve:**
- File: \`path/to/file.js\`
- Action: [one specific, self-contained description of what changes]
- Nothing else changes

Ready to make this change? Type **yes** — or ask me anything first.
---

Rules:
1. One file per proposal.
2. When **yes** is received, commit the file. Your FIRST line must be:
  "Approved: [restate the specific action from the block above]" — before any code.
3. Any other reply is treated as a question — answer it and re-present the proposal block.
=== END /build CONTEXT ===
`.trim();
}

function markBuildSession(session) {
 session.session_type = "build";
 return session;
}

module.exports = {
 detectBuildTrigger,
 fetchFileContent,
 fetchRecentBuildSessions,
 assembleBuildContext,
 buildModeSystemPrompt,
 markBuildSession,
 BUILD_MODEL,
 OPEN_ITEMS
};
