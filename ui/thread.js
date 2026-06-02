// ─── THREAD.JS — Thread view, triage, navigation ─────────────────────────────

const TRIAGE_DAYS = 14;

function showError(msg) {
  if (currentView === 'thread') addMessage('assistant', 'Error: ' + msg);
  else showDashboardMessage('assistant', 'Error: ' + msg);
}

function getLastActivityDate(thread) {
  const progress = thread['Current progress'] || '';
  const lastSaved = progress.match(/\[(?:Auto-saved|Session) ([^\]]+)\]/g);
  if (lastSaved) {
    const lastEntry = lastSaved[lastSaved.length - 1];
    const dateStr = lastEntry.replace(/\[(?:Auto-saved|Session) /, '').replace(']', '').split(' ')[0];
    const lastDate = new Date(dateStr);
    if (!isNaN(lastDate)) return lastDate;
  }
  if (thread['created_at']) {
    const created = new Date(thread['created_at']);
    if (!isNaN(created)) return created;
  }
  return null;
}

function isInTriage(thread) {
  if (thread['Status'] !== 'Active') return false;
  if (thread['thread_type'] === 'feature') return false;
  const lastActivity = getLastActivityDate(thread);
  if (!lastActivity) return false;
  const daysSince = (Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24);
  return daysSince >= TRIAGE_DAYS;
}

function daysSinceActivity(thread) {
  const lastActivity = getLastActivityDate(thread);
  if (!lastActivity) return null;
  return Math.floor((Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24));
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

function showTriageScreen(thread) {
  const days = daysSinceActivity(thread);
  const daysText = days !== null ? `${days} days ago` : 'unknown';

  document.getElementById('dashboard').style.display = 'none';
  document.getElementById('thread-view').style.display = 'flex';
  document.getElementById('thread-title').textContent = thread['Thread name'];
  document.getElementById('chat-messages').innerHTML = '';

  document.getElementById('board-content').innerHTML = `
    <div class="triage-screen">
      <div class="triage-screen-eyebrow">🕰 Triage</div>
      <div class="triage-screen-title">${thread['Thread name']}</div>
      <div class="triage-screen-meta">Last active ${daysText}</div>
      ${thread['Goal'] ? `<div class="triage-screen-goal">${thread['Goal']}</div>` : ''}
      <div class="triage-screen-actions">
        <button class="triage-action-btn reactivate" data-action="reactivate" data-id="${thread.id}">
          <span class="triage-action-icon">⚡</span>
          <span><span class="triage-action-label">Reactivate</span><span class="triage-action-sub">Pick up where you left off</span></span>
        </button>
        <button class="triage-action-btn review" data-action="review" data-id="${thread.id}">
          <span class="triage-action-icon">👁</span>
          <span><span class="triage-action-label">Review</span><span class="triage-action-sub">See progress before deciding</span></span>
        </button>
        <button class="triage-action-btn archive" data-action="archive" data-id="${thread.id}">
          <span class="triage-action-icon">📦</span>
          <span><span class="triage-action-label">Archive</span><span class="triage-action-sub">Mark complete and close</span></span>
        </button>
      </div>
    </div>`;

  document.querySelectorAll('.triage-action-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      const id = parseInt(btn.dataset.id);
      if (action === 'reactivate') triageReactivate(id);
      else if (action === 'review') triageReview(id);
      else if (action === 'archive') triageArchive(id);
    });
  });

  addMessage('assistant', `${thread['Thread name']} has been quiet for ${daysText}. What do you want to do with it?`);
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

async function triageReactivate(id) {
  const thread = await fetchThread(id);
  if (!thread) return;
  const newProgress = (thread['Current progress'] || '') + '\n\n[Reactivated ' + new Date().toLocaleDateString() + ']';
  await updateThread(id, { 'Current progress': newProgress });
  clearInsightCache(id);
  setTimeout(() => loadThreads(), 1000);
  await openThread(id);
  addMessage('assistant', `Back on ${thread['Thread name']}. Next step was: ${thread['Next step'] || 'not set'} — still the right move?`);
}

async function triageReview(id) {
  await openThread(id);
  if (currentThread) addMessage('assistant', `Reviewing ${currentThread['Thread name']}. Take a look at the board — what do you want to do with it?`);
}

async function triageArchive(id) {
  await updateThread(id, { 'Status': 'Complete' });
  clearInsightCache(id);
  setTimeout(() => loadThreads(), 500);
  backToDashboard();
  setTimeout(() => showDashboardMessage('assistant', 'Archived. Good call — keeping things clean.'), 300);
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
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:24px;max-width:320px;width:100%;">
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
