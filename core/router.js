// ─── ROUTER.JS — Intent detection and routing ─────────────────────────────────

async function detectIntent(text) {
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        system: `You are an intent classifier. Classify the user's message into exactly one of these intents:

- build_request: they want to change, fix, improve, or build anything visual or functional
- thread_update: they want to file, save, log, or update project information
- new_project: they want to start a new project or app
- chat: anything else — questions, thinking out loud, conversation

Respond with ONLY one of these exact strings: build_request, thread_update, new_project, chat`,
        messages: [{ role: 'user', content: text }]
      })
    });
    const data = await response.json();
    if (data.content && data.content[0]) {
      return data.content[0].text.trim();
    }
  } catch(e) {}
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
