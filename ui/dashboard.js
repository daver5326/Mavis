// ─── DASHBOARD.JS — Dashboard render and routing UI ──────────────────────────

function showDashboardMessage(role, text) {
  const msgContainer = document.getElementById('dashboard-messages');
  msgContainer.style.display = 'flex';
  const div = document.createElement('div');
  div.className = 'message ' + role;
  div.textContent = text;
  msgContainer.appendChild(div);
  msgContainer.scrollTop = 999999;
}

async function loadThreads() {
  try {
    const threads = await fetchAllThreads();

    if (threads.length === 0) {
      document.getElementById('thread-list').innerHTML = '<p class="loading">No threads yet. Tap + to add one.</p>';
      return;
    }

    const active = [], triage = [], other = [], features = [];

    threads.forEach(t => {
      if (t['thread_type'] === 'feature') features.push(t);
      else if (t['Status'] === 'Active' && isInTriage(t)) triage.push(t);
      else if (t['Status'] === 'Active') active.push(t);
      else other.push(t);
    });

    const renderCard = (thread) => {
      const isComplete = thread['Status'] === 'Complete';
      const isPaused = thread['Status'] === 'Paused';
      const isFeature = thread['thread_type'] === 'feature';
      return `<div class="thread-card ${isPaused ? 'paused' : ''} ${isComplete ? 'complete' : ''} ${isFeature ? 'feature' : ''}" onclick="openThread(${thread.id})">
        <div class="platform-badge">${isFeature ? 'Feature' : (thread.platform || 'Mavis')}</div>
        <h2>${thread['Thread name']}</h2>
        <p class="thread-status">${thread['Status'] || 'Active'} · ${thread['Next step'] ? thread['Next step'].slice(0,60) + '...' : (isFeature ? 'Tap to use' : 'No next step set')}</p>
      </div>`;
    };

    let html = '';
    if (active.length > 0) html += active.map(renderCard).join('');
    if (features.length > 0) {
      html += `<div class="triage-section" style="border-top-color:rgba(123,47,255,0.3);">
        <div class="triage-header">
          <div class="triage-dot" style="background:var(--purple-bright);box-shadow:0 0 7px var(--purple-bright);"></div>
          <span class="triage-label" style="color:var(--purple-glow);">Built by Mavis</span>
          <span class="triage-count" style="background:rgba(123,47,255,0.12);color:var(--purple-glow);">${features.length}</span>
        </div>
        ${features.map(renderCard).join('')}
      </div>`;
    }
    if (other.length > 0) html += other.map(renderCard).join('');
    if (triage.length > 0) {
      html += `<div class="triage-section">
        <div class="triage-header">
          <div class="triage-dot"></div>
          <span class="triage-label">Triage</span>
          <span class="triage-count">${triage.length}</span>
        </div>
        <p class="triage-desc">Inactive 14+ days — review, reactivate, or close.</p>
        ${triage.map(t => {
          const days = daysSinceActivity(t);
          return `<div class="thread-card triage" onclick="openThread(${t.id})">
            <div class="platform-badge">${t.platform || 'Mavis'}</div>
            <h2>${t['Thread name']}</h2>
            <p class="thread-status">Inactive ${days !== null ? days + ' days' : ''} · ${t['Next step'] ? t['Next step'].slice(0,50) + '...' : 'No next step set'}</p>
          </div>`;
        }).join('')}
      </div>`;
    }

    document.getElementById('thread-list').innerHTML = html;

  } catch(e) {
    document.getElementById('thread-list').innerHTML = '<p class="loading">Error: ' + e.message + '</p>';
  }
}

function showRoutingSuggestion(routing, text) {
  const msgContainer = document.getElementById('dashboard-messages');

  if (routing.route) {
    pendingRoute = { type: 'existing', thread_id: routing.thread_id, text };
    const div = document.createElement('div');
    div.className = 'message assistant';
    div.innerHTML = `${routing.reason} — route this to <strong>${routing.thread_name}</strong>?
      <div style="display:flex;gap:8px;margin-top:10px;">
        <button onclick="confirmRoute()" style="background:var(--purple-bright);color:#fff;border:none;border-radius:8px;padding:8px 16px;font-family:Syne,sans-serif;font-size:12px;font-weight:700;cursor:pointer;">Yes, route it</button>
        <button onclick="dismissRoute()" style="background:var(--white-08);color:var(--text-secondary);border:1px solid var(--border);border-radius:8px;padding:8px 16px;font-family:Syne,sans-serif;font-size:12px;cursor:pointer;">Just chat</button>
      </div>`;
    msgContainer.appendChild(div);
    msgContainer.scrollTop = 999999;
  } else if (routing.suggest_new) {
    pendingRoute = { type: 'new', suggested_name: routing.suggested_name, text };
    const div = document.createElement('div');
    div.className = 'message assistant';
    div.innerHTML = `${routing.reason} — start a new thread called <strong>${routing.suggested_name}</strong>?
      <div style="display:flex;gap:8px;margin-top:10px;">
        <button onclick="confirmRoute()" style="background:var(--purple-bright);color:#fff;border:none;border-radius:8px;padding:8px 16px;font-family:Syne,sans-serif;font-size:12px;font-weight:700;cursor:pointer;">Yes, create it</button>
        <button onclick="dismissRoute()" style="background:var(--white-08);color:var(--text-secondary);border:1px solid var(--border);border-radius:8px;padding:8px 16px;font-family:Syne,sans-serif;font-size:12px;cursor:pointer;">Just chat</button>
      </div>`;
    msgContainer.appendChild(div);
    msgContainer.scrollTop = 999999;
  } else {
    return false;
  }
  return true;
}

async function confirmRoute() {
  if (!pendingRoute) return;
  const msgContainer = document.getElementById('dashboard-messages');
  const lastMsg = msgContainer.lastElementChild;
  if (lastMsg) lastMsg.remove();

  if (pendingRoute.type === 'existing') {
    const threadId = pendingRoute.thread_id;
    const text = pendingRoute.text;
    pendingRoute = null;
    const thread = await fetchThread(threadId);
    if (thread) {
      await appendProgress(thread, text, 'Routed from dashboard');
      openThread(threadId);
    }
  } else if (pendingRoute.type === 'new') {
    const name = pendingRoute.suggested_name;
    const text = pendingRoute.text;
    pendingRoute = null;
    const { data: newThread, error } = await insertThread({
      'Thread name': name,
      'Goal': text,
      'Status': 'Active',
      'platform': 'Mavis'
    });
    if (!error && newThread) {
      loadThreads();
      openThread(newThread.id);
    }
  }
}

function dismissRoute() {
  pendingRoute = null;
  const msgContainer = document.getElementById('dashboard-messages');
  const lastMsg = msgContainer.lastElementChild;
  if (lastMsg) lastMsg.remove();
}

async function greetOnLoad() {
  try {
    window._livingDocSummary = await loadLivingDocumentSummary();

    const threads = await fetchAllThreads();
    const active = threads.filter(t => t['Status'] === 'Active' && t['thread_type'] !== 'feature' && !isInTriage(t));
    if (active.length === 0) return;

    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const suggested = active.find(t => t['Next step']) || active[0];

    let recentSessions = [];
    try { recentSessions = await loadRecentSessions(3); } catch(e) {}

    systemContext = buildMasterContext(threads, recentSessions);
    chatHistory = [];
    window._sessionLog = [];

    const prompt = `${greeting} David. Brief, natural, personal greeting. ${active.length} active projects. Suggest one thing to work on based on: "${suggested['Thread name']}" — next step: "${suggested['Next step'] || 'no next step set'}". 2-3 sentences max. Direct and energetic.`;

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ system: systemContext, messages: [{ role: 'user', content: prompt }] })
    });
    const data = await response.json();
    if (data.content && data.content[0]) {
      const msg = data.content[0].text;
      showDashboardMessage('assistant', msg);
      speak(msg);
      chatHistory.push({ role: 'assistant', content: msg });
      window._sessionLog.push({ role: 'assistant', content: msg });
    }
  } catch(e) {
    showDashboardMessage('assistant', 'Good morning David. Ready when you are.');
  }
}