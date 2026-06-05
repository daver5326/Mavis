// ─── NAVIGATION.JS — Thread navigation and forms ─────────────────────────────

function showError(msg) {
  if (currentView === 'thread') addMessage('assistant', 'Error: ' + msg);
  else showDashboardMessage('assistant', 'Error: ' + msg);
}

function addMessage(role, text) {
  const messagesEl = document.getElementById('chat-messages');
  if (!messagesEl) return;
  const div = document.createElement('div');
  div.className = 'message ' + role;
  div.textContent = text;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = 999999;
  if (role !== 'assistant' || chatHistory.length === 0) chatHistory.push({ role, content: text });
  if (window._sessionLog) window._sessionLog.push({ role, content: text });
  if (role === 'assistant' && text !== '...') speak(text);
}

async function openThread(id) {
  const thread = await fetchThread(id);
  if (!thread) return;
  currentThread = thread;
  chatHistory = [];
  audioEnabled = false;
  isListening = false;
  currentView = 'thread';
  pendingRoute = null;

  const micBtn = document.getElementById('mic-btn');
  if (micBtn) { micBtn.textContent = '🎤'; micBtn.style.opacity = '1'; }

  if (isInTriage(currentThread)) {
    showTriageScreen(currentThread);
    return;
  }

  document.getElementById('dashboard').style.display = 'none';
  document.getElementById('dashboard-messages').innerHTML = '';
  document.getElementById('thread-view').style.display = 'flex';
  document.getElementById('thread-title').textContent = currentThread['Thread name'];
  document.getElementById('chat-messages').innerHTML = '';
  document.getElementById('board-content').innerHTML = '<p class="loading" style="margin-top:16px;">Loading...</p>';

  if (currentThread['thread_type'] === 'feature') {
    renderFeatureUI(currentThread);
    systemContext = `You are Mavis. David is using a feature you built: "${currentThread['Thread name']}". Help him use it, add entries, view data, or modify it. Keep responses short and conversational. No markdown.`;
    addMessage('assistant', `${currentThread['Thread name']} — ready to use. What would you like to do?`);
    return;
  }

  const ideas = await fetchIdeas(id);
  const board = buildBoardFromThread(currentThread, ideas);
  renderBoard(board);

  generateInsightCard(currentThread, ideas).then(insight => {
    if (insight) injectInsight(insight);
    else { const card = document.getElementById('insight-card'); if (card) card.style.display = 'none'; }
  });

  const allThreads = await fetchAllThreads();
  const otherThreads = allThreads.filter(t => t.id !== id && t['Status'] === 'Active');
  systemContext = buildThreadContext(currentThread, ideas, otherThreads);

  let openingMsg = `On ${currentThread['Thread name']}.`;
  if (currentThread['Next step']) openingMsg += ` Next up: ${currentThread['Next step']}`;
  addMessage('assistant', openingMsg);
}

function renderFeatureUI(thread) {
  const container = document.getElementById('board-content');
  try {
    const html = thread['custom_ui'] || '<p class="loading">No UI generated yet.</p>';
    container.innerHTML = html;
    container.querySelectorAll('script').forEach(oldScript => {
      const newScript = document.createElement('script');
      newScript.textContent = oldScript.textContent;
      oldScript.parentNode.replaceChild(newScript, oldScript);
    });
  } catch(e) {
    container.innerHTML = '<p class="loading">Error rendering feature: ' + e.message + '</p>';
  }
}

function backToDashboard() {
  autoSaveProgress();
  endSession();
  window.speechSynthesis.cancel();
  if (isListening && recognition) { isListening = false; recognition.stop(); }
  audioEnabled = false;
  currentView = 'dashboard';
  pendingRoute = null;
  document.getElementById('dashboard').style.display = 'block';
  document.getElementById('thread-view').style.display = 'none';
  currentThread = null;
  chatHistory = [];
  const micBtn = document.getElementById('mic-btn');
  if (micBtn) micBtn.textContent = '🎤';
}

function openNewThreadForm() {
  document.getElementById('dashboard').style.display = 'none';
  document.getElementById('new-thread-view').style.display = 'block';
}

function closeNewThreadForm() {
  document.getElementById('new-thread-view').style.display = 'none';
  document.getElementById('dashboard').style.display = 'block';
}

function openEditThread() {
  if (!currentThread) return;
  document.getElementById('thread-view').style.display = 'none';
  document.getElementById('edit-thread-view').style.display = 'block';
  document.getElementById('et-name').value = currentThread['Thread name'] || '';
  document.getElementById('et-status').value = currentThread['Status'] || 'Active';
  document.getElementById('et-goal').value = currentThread['Goal'] || '';
  document.getElementById('et-progress').value = currentThread['Current progress'] || '';
  document.getElementById('et-nextstep').value = currentThread['Next step'] || '';
  document.getElementById('et-decisions').value = currentThread['Decisions made'] || '';
  document.getElementById('et-questions').value = currentThread['Open question'] || '';
  document.getElementById('et-notes').value = currentThread['Note'] || '';
}

function closeEditThread() {
  document.getElementById('edit-thread-view').style.display = 'none';
  document.getElementById('thread-view').style.display = 'flex';
}

async function saveEditThread() {
  const updates = {
    'Thread name': document.getElementById('et-name').value.trim(),
    'Status': document.getElementById('et-status').value,
    'Goal': document.getElementById('et-goal').value.trim(),
    'Current progress': document.getElementById('et-progress').value.trim(),
    'Next step': document.getElementById('et-nextstep').value.trim(),
    'Decisions made': document.getElementById('et-decisions').value.trim(),
    'Open question': document.getElementById('et-questions').value.trim(),
    'Note': document.getElementById('et-notes').value.trim(),
  };
  const { error } = await updateThread(currentThread.id, updates);
  if (error) showError(error.message);
  else {
    clearInsightCache(currentThread.id);
    Object.assign(currentThread, updates);
    closeEditThread();
    addMessage('assistant', 'Thread updated.');
  }
}

async function deleteThread() {
  if (!currentThread) return;
  const confirmDiv = document.createElement('div');
  confirmDiv.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:9999;padding:24px;';
  confirmDiv.innerHTML = `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:24px;max-width:320px;width:100%);">
      <div style="font-family:Syne,sans-serif;font-size:16px;font-weight:700;color:var(--text-primary);margin-bottom:8px;">Delete "${currentThread['Thread name']}"?</div>
      <div style="font-size:14px;color:var(--text-secondary);margin-bottom:20px;">This cannot be undone.</div>
      <div style="display:flex;gap:8px;">
        <button id="confirm-delete-btn" style="flex:1;background:#ef4444;color:#fff;border:none;border-radius:8px;padding:10px;font-family:Syne,sans-serif;font-size:13px;font-weight:700;cursor:pointer;">Delete</button>
        <button id="cancel-delete-btn" style="flex:1;background:var(--white-08);color:var(--text-secondary);border:1px solid var(--border);border-radius:8px;padding:10px;font-family:Syne,sans-serif;font-size:13px;cursor:pointer;">Cancel</button>
      </div>
    </div>`;
  document.body.appendChild(confirmDiv);

  document.getElementById('cancel-delete-btn').addEventListener('click', () => confirmDiv.remove());
  document.getElementById('confirm-delete-btn').addEventListener('click', async () => {
    confirmDiv.remove();
    const { error } = await deleteThreadById(currentThread.id);
    if (error) showError(error.message);
    else {
      clearInsightCache(currentThread.id);
      document.getElementById('edit-thread-view').style.display = 'none';
      document.getElementById('dashboard').style.display = 'block';
      currentView = 'dashboard';
      currentThread = null;
      loadThreads();
    }
  });
}

async function saveNewThread() {
  const name = document.getElementById('nt-name').value.trim();
  const goal = document.getElementById('nt-goal').value.trim();
  if (!name || !goal) { showError('Name and goal are required.'); return; }
  const { error } = await insertThread({
    'Thread name': name,
    'platform': document.getElementById('nt-platform').value,
    'Goal': goal,
    'Status': 'Active',
    'Next step': document.getElementById('nt-nextstep').value.trim(),
    'Decisions made': document.getElementById('nt-decisions').value.trim(),
    'Open question': document.getElementById('nt-questions').value.trim(),
    'Note': document.getElementById('nt-notes').value.trim(),
  });
  if (error) { showError(error.message); return; }
  ['nt-name','nt-goal','nt-nextstep','nt-decisions','nt-questions','nt-notes'].forEach(id => {
    document.getElementById(id).value = '';
  });
  closeNewThreadForm();
  loadThreads();
}

async function switchToProject(name) {
  const threads = await fetchAllThreads();
  const match = threads.find(t => t['Thread name'].toLowerCase().includes(name));
  if (match) openThread(match.id);
  else {
    const msg = `Couldn't find "${name}". Your projects: ${threads.map(t => t['Thread name']).join(', ')}`;
    if (currentView === 'dashboard') showDashboardMessage('assistant', msg);
    else addMessage('assistant', msg);
  }
}

// ─── COUNCIL HUDDLE ──────────────────────────────────────────────────────────

async function runCouncilHuddle() {
  if (!currentThread) return;

  addMessage('assistant', 'Ellis: Calling the huddle. One moment.');

  const threadContext = `
Thread: ${currentThread['Thread name']}
Goal: ${currentThread['Goal'] || 'Not set'}
Status: ${currentThread['Status'] || 'Active'}
Next Step: ${currentThread['Next step'] || 'Not set'}
Decisions Made: ${currentThread['Decisions made'] || 'None'}
Open Questions: ${currentThread['Open question'] || 'None'}
Recent Progress: ${(currentThread['Current progress'] || '').slice(-800)}
  `.trim();

  const councilPersonas = COUNCIL_BLOCK;

  const system = `You are Ellis, Council Director for Mavis. You run structured huddles for David Rogers, a solo creator building Mavis — a modular AI app factory.

The Council members are:
${councilPersonas}

Your job: frame the key question this thread is facing, then call on each relevant Council member individually to speak from their domain. End with one clear question or recommendation for David.

Rules:
- Always respond in English only.
- Always refer to Council members by their exact names: Ellis, Fred, Ralph, Maya, Dmitri, Amara, Sara, Rex, Nora, Callum, Marci. Never use generic labels.
- Never summarize the Council as a group. Each member speaks individually in their own voice.
- Structure your output exactly like this:
  Ellis: [one sentence framing the question]
  [Member name]: [their observation in their voice]
  [Member name]: [their observation in their voice]
  ... only include members with something relevant to say ...
  Ellis: [one closing question or recommendation for David]
- Output scales to decision size. Small decision: 3-4 voices. Big decision: every voice.
- Never a novel. Edit ruthlessly.
- No asterisks, no bold, no markdown. Plain text only.`;

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system,
        messages: [{
          role: 'user',
          content: `Current thread context:\n${threadContext}\n\nRecent conversation:\n${chatHistory.slice(-6).map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n')}`
        }]
      })
    });
    const data = await response.json();
    if (data.content && data.content[0]) {
      addMessage('assistant', data.content[0].text.trim());
    }
  } catch(e) {
    addMessage('assistant', 'Council huddle failed: ' + e.message);
  }
}

// ─── EVENT LISTENERS ─────────────────────────────────────────────────────────

function initEventListeners() {
  document.getElementById('back-btn').addEventListener('click', backToDashboard);
  document.getElementById('edit-thread-btn').addEventListener('click', openEditThread);
  document.getElementById('council-btn').addEventListener('click', runCouncilHuddle);
  document.getElementById('close-new-thread-btn').addEventListener('click', closeNewThreadForm);
  document.getElementById('save-new-thread-btn').addEventListener('click', saveNewThread);
  document.getElementById('close-edit-thread-btn').addEventListener('click', closeEditThread);
  document.getElementById('save-edit-thread-btn').addEventListener('click', saveEditThread);
  document.getElementById('delete-thread-btn').addEventListener('click', deleteThread);
  document.getElementById('close-card-btn').addEventListener('click', closeCardDetail);
}
