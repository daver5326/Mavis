// ─── ROUTER.JS — Intent detection and routing ─────────────────────────────────

const INTENTS = {
  selfModify: [
    'update yourself', 'modify yourself', 'change your code', 'update your code',
    'rewrite yourself', 'update mavis code', 'change mavis', 'modify mavis',
    'update the app', 'change the app', 'fix the app', 'improve the app',
    'add to yourself', 'update app.js'
  ],
  build: [
    'build', 'create', 'add a', 'i want to track', 'make a', 'new feature',
    'can you build', 'can mavis build', 'add feature', 'i need a'
  ],
  update: [
    'update mavis', 'file this', 'save this to', 'add this to', 'put this in',
    'log this to', 'store this in', 'session summary', 'update my thread', 'update thread'
  ],
  newProject: [
    'new project', 'new app', 'new repo', 'create a project', 'create an app',
    'start a project', 'start an app', 'launch a project', 'launch an app',
    'scaffold', 'new external'
  ],
  agentRead: [
    'read your', 'show me your', 'look at your', 'open your', 'check your',
    'what is in your', "what's in your", 'read the file', 'show me the file',
    'use your agent to read', 'agent read'
  ],
  agentWrite: [
    'use your agent to', 'agent write', 'agent update', 'agent fix',
    'update the file', 'write to', 'commit this', 'push this change',
    'strengthen', 'improve the instruction', 'fix the instruction',
    'change the instruction', 'update the instruction'
  ]
};

function detectIntent(text) {
  const lower = text.toLowerCase();
  for (const [intent, triggers] of Object.entries(INTENTS)) {
    if (triggers.some(t => lower.includes(t))) return intent;
  }
  return 'chat';
}

async function analyzeAndRoute(text, threads) {
  const active = threads.filter(t => t['Status'] === 'Active' && t['thread_type'] !== 'feature');
  if (active.length === 0) return null;

  const threadList = active.map(t =>
    `ID:${t.id} | Name: ${t['Thread name']} | Goal: ${(t['Goal'] || '').slice(0,100)}`
  ).join('\n');

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system: `You are Mavis's routing brain. David said something on the dashboard. Decide if it belongs to an existing project thread.

Active threads:
${threadList}

Rules:
- If the message clearly relates to one of these threads, return JSON: {"route": true, "thread_id": <id>, "thread_name": "<name>", "reason": "one short sentence why"}
- If it's a new topic that deserves its own thread, return JSON: {"route": false, "suggest_new": true, "suggested_name": "<short thread name>", "reason": "one short sentence why"}
- If it's just casual chat or a question, return JSON: {"route": false, "suggest_new": false}
Respond with ONLY valid JSON.`,
        messages: [{ role: 'user', content: text }]
      })
    });
    const data = await response.json();
    if (data.content && data.content[0]) {
      const raw = data.content[0].text.trim().replace(/```json|```/g, '');
      return JSON.parse(raw);
    }
  } catch(e) {}
  return null;
}

// ── Agent action planner — asks Claude what file to touch and how ─────────────
async function planAgentAction(text, repoMap) {
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system: `You are Mavis's agent planner. David wants to modify a file in the Mavis codebase.

Repo structure:
${JSON.stringify(repoMap, null, 2)}

Return ONLY valid JSON:
{
  "file": "<path to file, e.g. core/context.js>",
  "instruction": "<exactly what to change and how>",
  "reason": "<one sentence why>"
}`,
        messages: [{ role: 'user', content: text }]
      })
    });
    const data = await response.json();
    if (data.content && data.content[0]) {
      const raw = data.content[0].text.trim().replace(/```json|```/g, '');
      return JSON.parse(raw);
    }
  } catch(e) {}
  return null;
}
