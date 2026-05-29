// ─── CHAT.JS — Conversation engine ───────────────────────────────────────────

async function sendMessage(inputId) {
  const inputElId = inputId || (currentView === 'dashboard' ? 'dashboard-input' : 'chat-input');
  const input = document.getElementById(inputElId);
  const text = input.value.trim();
  if (!text) return;
  input.value = '';

  if (currentView === 'dashboard') {
    showDashboardMessage('user', text);
    if (window._sessionLog) window._sessionLog.push({ role: 'user', content: text });

    // ── LLM intent classification ─────────────────────────────────────────
    const intentResponse = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system: `You are Mavis's intent classifier. Classify David's input into exactly one of these intents:
- "agentAction": any request to read, write, create, update, fix, or modify a file, codebase, or database
- "threadUpdate": filing information into a project thread
- "newProject": starting a brand new external project or repo
- "chat": everything else

Respond with ONLY valid JSON: {"intent": "<one of the above>", "reason": "<one sentence>"}`,
        messages: [{ role: 'user', content: text }]
      })
    });
    const intentData = await intentResponse.json();
    let intent = 'chat';
    try {
      const parsed = JSON.parse(intentData.content[0].text.trim().replace(/```json|```/g, ''));
      intent = parsed.intent;
    } catch(e) {}

    if (intent === 'threadUpdate') { handleThreadUpdate(text); return; }
    if (intent === 'newProject') { handleNewProjectRequest(text); return; }
    if (intent === 'agentAction') { handleAgentAction(text); return; }

    // ── Regular chat ──────────────────────────────────────────────────────
    const threads = await fetchAllThreads();
    let repoMap = null;
    try { repoMap = await agent.mapRepo(); } catch(e) {}

    systemContext = buildMasterContext(threads, window._recentSessions || [], repoMap);
    chatHistory.push({ role: 'user', content: text });

    const routingPromise = analyzeAndRoute(text, threads);

    const thinking = document.createElement('div');
    thinking.className = 'message assistant thinking';
    thinking.textContent = '...';
    const msgContainer = document.getElementById('dashboard-messages');
    msgContainer.appendChild(thinking);
    msgContainer.scrollTop = 999999;

    try {
      const [chatResponse, routing] = await Promise.all([
        fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ system: systemContext, messages: chatHistory.slice(-10) })
        }),
        routingPromise
      ]);

      thinking.remove();
      const data = await chatResponse.json();

      if (data.content && data.content[0]) {
        const reply = data.content[0].text;
        showDashboardMessage('assistant', reply);
        if (window._sessionLog) window._sessionLog.push({ role: 'assistant', content: reply });
        chatHistory.push({ role: 'assistant', content: reply });
        speak(reply);
        if (window._sessionLog && window._sessionLog.length >= 2) {
          const rawLog = window._sessionLog.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n');
          saveSession(rawLog);
        }
      }

      if (routing && (routing.route || routing.suggest_new)) {
        setTimeout(() => showRoutingSuggestion(routing, text), 600);
      }

    } catch(e) {
      thinking.remove();
      showDashboardMessage('assistant', 'Error: ' + e.message);
    }
    return;
  }

  // Thread view
  addMessage('user', text);
  chatHistory.push({ role: 'user', content: text });

  const thinking = document.createElement('div');
  thinking.className = 'message assistant thinking';
  thinking.textContent = '...';
  document.getElementById('chat-messages').appendChild(thinking);
  document.getElementById('chat-messages').scrollTop = 999999;

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ system: systemContext, messages: chatHistory.slice(-10) })
    });
    const data = await response.json();
    thinking.remove();
    if (data.content && data.content[0]) {
      const reply = data.content[0].text;
      addMessage('assistant', reply);
      chatHistory.push({ role: 'assistant', content: reply });
    }
  } catch(e) {
    thinking.remove();
    addMessage('assistant', 'Error: ' + e.message);
  }
}

// ── Tool-use agent action handler ─────────────────────────────────────────────
async function handleAgentAction(text) {
  const msgContainer = document.getElementById('dashboard-messages');
  const status = document.createElement('div');
  status.className = 'message assistant';
  status.textContent = 'Planning action...';
  msgContainer.appendChild(status);
  msgContainer.scrollTop = 999999;

  try {
    const repoMap = await agent.mapRepo();

    // ── LLM tool planner ──────────────────────────────────────────────────
    const planResponse = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system: `You are Mavis's agent planner. You have these tools available:

- writeFile: write or create a file in the GitHub repo
  params: { file, instruction, reason }
- readFile: read a file from the GitHub repo
  params: { file }
- dbExec: execute a database operation (INSERT, UPDATE, DELETE, CREATE TABLE)
  params: { action ("insert"|"update"|"delete"|"sql"), table, data?, filters?, query? }
- dbQuery: read from the database (SELECT)
  params: { table, filters? }
- multiStep: multiple operations in sequence
  params: { steps: [ {tool, params} ] }

Repo structure: ${JSON.stringify(repoMap)}

Respond with ONLY valid JSON: { "tool": "<tool name>", "params": <params object>, "reason": "<one sentence>" }`,
        messages: [{ role: 'user', content: text }]
      })
    });

    const planData = await planResponse.json();
    const plan = JSON.parse(planData.content[0].text.trim().replace(/```json|```/g, ''));

    // ── Route to correct tool ─────────────────────────────────────────────
    if (plan.tool === 'writeFile') {
      await handleWriteFile(plan.params, plan.reason, msgContainer, status);
    } else if (plan.tool === 'dbExec') {
      await handleDbExec(plan.params, plan.reason, msgContainer, status);
    } else if (plan.tool === 'dbQuery') {
      await handleDbQuery(plan.params, plan.reason, msgContainer, status);
    } else if (plan.tool === 'multiStep') {
      await handleMultiStep(plan.params.steps, plan.reason, msgContainer, status);
    } else {
      status.textContent = `Unknown tool: ${plan.tool}`;
    }

  } catch(e) {
    status.textContent = 'Agent error: ' + e.message;
  }
}

// ── Tool: writeFile ───────────────────────────────────────────────────────────
async function handleWriteFile(params, reason, msgContainer, status) {
  status.textContent = `Reading ${params.file}...`;
  let current = null;
  try { current = await agent.readFile(params.file); } catch(e) { current = null; }

  const writeResponse = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system: `You are Mavis's agent. Return ONLY the complete file content. No explanation, no markdown, no code fences.`,
      messages: [{
        role: 'user',
        content: `File: ${params.file}\n\nInstruction: ${params.instruction}\n\n${current ? 'Current content:\n' + current.content : 'New file — create from scratch.'}`
      }]
    })
  });
  const writeData = await writeResponse.json();
  const newContent = writeData.content[0].text;

  status.remove();
  const proposal = document.createElement('div');
  proposal.className = 'message assistant';
  proposal.innerHTML = `
    <div style="margin-bottom:8px">${current ? 'Proposed change to' : 'Proposed new file'} <strong>${params.file}</strong>:</div>
    <div style="font-size:12px;opacity:0.7;margin-bottom:12px">${reason}</div>
    <div style="display:flex;gap:8px">
      <button onclick="confirmAgentWrite('${params.file}', this)"
        data-content="${encodeURIComponent(newContent)}"
        data-sha="${current ? current.sha : ''}"
        style="background:#7c3aed;color:white;border:none;padding:8px 16px;border-radius:8px;font-size:14px">
        Approve & Commit
      </button>
      <button onclick="this.closest('.message').remove()"
        style="background:#333;color:white;border:none;padding:8px 16px;border-radius:8px;font-size:14px">
        Reject
      </button>
    </div>`;
  msgContainer.appendChild(proposal);
  msgContainer.scrollTop = 999999;
}

// ── Tool: dbExec ──────────────────────────────────────────────────────────────
async function handleDbExec(params, reason, msgContainer, status) {
  status.remove();
  const proposal = document.createElement('div');
  proposal.className = 'message assistant';
  proposal.innerHTML = `
    <div style="margin-bottom:8px">Proposed database operation:</div>
    <div style="font-size:12px;opacity:0.7;margin-bottom:12px">${reason}</div>
    <div style="font-size:11px;background:#1a1a1a;padding:8px;border-radius:6px;margin-bottom:12px;word-break:break-all">${JSON.stringify(params)}</div>
    <div style="display:flex;gap:8px">
      <button onclick="confirmDbExec(this)"
        data-params="${encodeURIComponent(JSON.stringify(params))}"
        style="background:#7c3aed;color:white;border:none;padding:8px 16px;border-radius:8px;font-size:14px">
        Approve & Execute
      </button>
      <button onclick="this.closest('.message').remove()"
        style="background:#333;color:white;border:none;padding:8px 16px;border-radius:8px;font-size:14px">
        Reject
      </button>
    </div>`;
  msgContainer.appendChild(proposal);
  msgContainer.scrollTop = 999999;
}

// ── Tool: dbQuery ─────────────────────────────────────────────────────────────
async function handleDbQuery(params, reason, msgContainer, status) {
  status.textContent = `Querying ${params.table}...`;
  try {
    const result = await agent.supabaseQuery(params.table, params.filters || {});
    status.textContent = `Query result from ${params.table}: ${JSON.stringify(result).slice(0, 200)}`;
  } catch(e) {
    status.textContent = 'Query failed: ' + e.message;
  }
}

// ── Tool: multiStep ───────────────────────────────────────────────────────────
async function handleMultiStep(steps, reason, msgContainer, status) {
  status.textContent = `Planning ${steps.length} steps...`;
  const results = [];
  for (const step of steps) {
    if (step.tool === 'dbExec') {
      await handleDbExec(step.params, step.reason || reason, msgContainer, status);
    } else if (step.tool === 'writeFile') {
      await handleWriteFile(step.params, step.reason || reason, msgContainer, status);
    } else if (step.tool === 'dbQuery') {
      await handleDbQuery(step.params, step.reason || reason, msgContainer, status);
    }
  }
}

// ── Confirm handlers ──────────────────────────────────────────────────────────
async function confirmAgentWrite(filePath, btn) {
  const content = decodeURIComponent(btn.dataset.content);
  const sha = btn.dataset.sha || null;
  const msgEl = btn.closest('.message');
  btn.textContent = 'Committing...';
  btn.disabled = true;
  try {
    await agent.writeFile(filePath, content, `Agent: update ${filePath}`, sha);
    msgEl.innerHTML = `Committed. ${filePath} updated successfully.`;
  } catch(e) {
    msgEl.innerHTML = `Commit failed: ${e.message}`;
  }
}

async function confirmDbExec(btn) {
  const params = JSON.parse(decodeURIComponent(btn.dataset.params));
  const msgEl = btn.closest('.message');
  btn.textContent = 'Executing...';
  btn.disabled = true;
  try {
    await agent.supabaseExec(params.action, params.table, params);
    msgEl.innerHTML = `Executed successfully.`;
  } catch(e) {
    msgEl.innerHTML = `Execution failed: ${e.message}`;
  }
}

async function handleThreadUpdate(text) {
  const msgContainer = document.getElementById('dashboard-messages');
  const status = document.createElement('div');
  status.className = 'message assistant';
  status.textContent = 'Organizing this and filing it...';
  msgContainer.appendChild(status);
  msgContainer.scrollTop = 999999;

  const threads = await fetchAllThreads();
  const active = threads.filter(t => t['Status'] === 'Active' && t['thread_type'] !== 'feature');
  const threadList = active.map(t => `ID:${t.id} | Name: ${t['Thread name']} | Goal: ${(t['Goal']||'').slice(0,80)}`).join('\n');

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system: `You are Mavis organizing information from David into the right project thread.
Active threads:
${threadList}
Respond with ONLY valid JSON:
{
  "thread_id": <must be one of the IDs listed above>,
  "thread_name": "<name of the matched thread>",
  "updates": {
    "Goal": "<updated goal or null if unchanged>",
    "Next step": "<most important next action or null>",
    "Decisions made": "<new decisions to append, or null>",
    "Open question": "<new open questions to append, or null>",
    "Current progress": "<concise summary of this session to append>"
  }
}`,
        messages: [{ role: 'user', content: text }]
      })
    });

    const data = await response.json();
    const raw = data.content[0].text.trim().replace(/```json|```/g, '');
    const plan = JSON.parse(raw);
    const validThread = active.find(t => t.id === plan.thread_id);
    if (!validThread) throw new Error(`Thread ID ${plan.thread_id} not found`);

    const updates = {};
    if (plan.updates['Goal']) updates['Goal'] = plan.updates['Goal'];
    if (plan.updates['Next step']) updates['Next step'] = plan.updates['Next step'];
    if (plan.updates['Decisions made']) updates['Decisions made'] = plan.updates['Decisions made'];
    if (plan.updates['Open question']) updates['Open question'] = plan.updates['Open question'];
    if (plan.updates['Current progress']) {
      updates['Current progress'] = (validThread['Current progress'] || '') +
        '\n\n[Session ' + new Date().toLocaleDateString() + ']\n' + plan.updates['Current progress'];
    }

    const { error } = await updateThread(plan.thread_id, updates);
    if (error) throw new Error(error.message);
    status.textContent = `Filed to "${plan.thread_name}" — updated.`;
    loadThreads();

  } catch(e) {
    status.textContent = 'Filing failed: ' + e.message;
  }
}

async function autoSaveProgress() {
  if (!currentThread || chatHistory.length < 3) return;
  const summary = chatHistory.slice(-8).map(m => (m.role === 'user' ? 'Me: ' : 'Mavis: ') + m.content).join('\n');
  await appendProgress(currentThread, summary, 'Auto-saved');
  updateDavidProfile(summary);
}

async function saveProgress() {
  if (!currentThread) return;
  const summary = chatHistory.slice(-6).map(m => (m.role === 'user' ? 'Me: ' : 'Mavis: ') + m.content).join('\n');
  const newProgress = await appendProgress(currentThread, summary, 'Session');
  currentThread['Current progress'] = newProgress;
  addMessage('assistant', 'Progress saved.');
  updateDavidProfile(summary);
}

async function saveIdea(transcript) {
  if (!currentThread) { showDashboardMessage('assistant', 'Open a project first.'); return; }
  const recentContext = chatHistory.slice(-4).map(m => m.content).join(' | ');
  const { error } = await insertIdea(currentThread.id, recentContext || transcript);
  if (error) addMessage('assistant', 'Error saving idea: ' + error.message);
  else addMessage('assistant', 'Banked.');
}
