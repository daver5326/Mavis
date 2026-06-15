// ─── CHAT.JS — Conversation engine ───────────────────────────────────────────

const MAX_HISTORY_WINDOW = 10;
const ROUTING_WORD_THRESHOLD = 6;

function shouldAnalyzeForRouting(text) {
const agentTriggers = ['/agent ', 'agent: ', 'agent do '];
if (agentTriggers.some(t => text.toLowerCase().startsWith(t))) return false;
return text.trim().split(/\s+/).length > ROUTING_WORD_THRESHOLD;
}

// ── Session ID — set once per session, cleared only in endSession ─────────────

function initSessionId() {
 if (!window._sessionId) {
   window._sessionId = crypto.randomUUID();
 }
}

// ── Build confirmation detection ───────────────────────────────────────────────

function isBuildConfirmation(text) {
 const confirmations = ['yes', 'go ahead', 'do it', 'commit', 'approved', 'confirm', 'make it so'];
 return confirmations.includes(text.trim().toLowerCase());
}

// ── Extract file path and code block from last Opus response ──────────────────

function extractBuildProposal(history) {
 // Walk back through build history to find last assistant message with a code block
 for (let i = history.length - 1; i >= 0; i--) {
   const msg = history[i];
   if (msg.role !== 'assistant') continue;

   // Extract file path from proposal block — "File: `path/to/file.js`"
   const pathMatch = msg.content.match(/File:\s*`([^`]+)`/);
   if (!pathMatch) continue;

   // Extract code block — ```js ... ``` or ``` ... ```
   const codeMatch = msg.content.match(/```(?:js|javascript)?\n([\s\S]+?)```/);
   if (!codeMatch) continue;

   return {
     path: pathMatch[1],
     content: codeMatch[1]
   };
 }
 return null;
}

// ── /build mode helpers ────────────────────────────────────────────────────

function parseBuildPaths(text) {
 const rest = text.trim().slice('/build'.length).trim();
 if (!rest.length) return [];
 return rest.split(/\s+/).filter(token => token.includes('/') || token.includes('.'));
}

async function handleBuildMode(text) {
 window._buildModeActive = true;
 initSessionId();
 const msgContainer = document.getElementById('dashboard-messages');

 // ── Commit path — confirmation of a pending proposal ──────────────────────
 if (isBuildConfirmation(text) && window._buildChatHistory && window._buildChatHistory.length > 0) {
   const proposal = extractBuildProposal(window._buildChatHistory);
   if (proposal) {
     const committing = document.createElement('div');
     committing.className = 'message assistant thinking';
     committing.textContent = `Committing ${proposal.path}...`;
     msgContainer.appendChild(committing);
     msgContainer.scrollTop = 999999;

     try {
       const writeRes = await fetch('/api/build-write', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
           path: proposal.path,
           content: proposal.content,
           commitMessage: `Mavis /build: update ${proposal.path}`
         })
       });
       const writeData = await writeRes.json();
       committing.remove();

       if (writeData.success) {
         showDashboardMessage('assistant', `Committed. ${proposal.path} is live — Vercel deploying now.`);
         if (window._sessionLog) window._sessionLog.push({ role: 'assistant', content: `Committed ${proposal.path}` });
         window._buildChatHistory.push({ role: 'user', content: text });
         window._buildChatHistory.push({ role: 'assistant', content: `Committed ${proposal.path}` });
       } else {
         showDashboardMessage('assistant', `Commit failed: ${writeData.error}`);
       }
     } catch (e) {
       committing.remove();
       showDashboardMessage('assistant', `Commit error: ${e.message}`);
     }
     return;
   }
 }

 const thinking = document.createElement('div');
 thinking.className = 'message assistant thinking';
 thinking.textContent = 'Assembling build context...';
 msgContainer.appendChild(thinking);
 msgContainer.scrollTop = 999999;

 try {
   const filePaths = parseBuildPaths(text);

   const ctxResponse = await fetch('/api/build-context', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({
       filePaths,
       ralphGlobals: {
         _livingDocSummary: window._livingDocSummary,
         _councilPersonas: window._councilPersonas,
         _recentSessions: window._recentSessions,
         _repoMap: window._repoMap,
         _davidProfile: window._davidProfile,
         _activeThreads: window._activeThreads
       }
     })
   });
   const ctxData = await ctxResponse.json();

   if (ctxData.error) {
     thinking.remove();
     showDashboardMessage('assistant', 'Build context error: ' + ctxData.error);
     return;
   }

   window._sessionType = 'build';
   thinking.textContent = '...';

   if (!window._buildChatHistory) window._buildChatHistory = [];
   window._buildChatHistory.push({ role: 'user', content: text });

   const chatResponse = await fetch('/api/chat', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({
       model: ctxData.model,
       system: ctxData.systemPrompt,
       messages: window._buildChatHistory.slice(-MAX_HISTORY_WINDOW)
     })
   });
   const data = await chatResponse.json();

   thinking.remove();

   if (data.content && data.content[0]) {
     const reply = data.content[0].text.trim();
     showDashboardMessage('assistant', reply);
     if (window._sessionLog) window._sessionLog.push({ role: 'assistant', content: reply });
     window._buildChatHistory.push({ role: 'assistant', content: reply });
     showMakeItSoButton(`${text} — ${reply.slice(0, 200)}`);
   } else if (data.error) {
     showDashboardMessage('assistant', 'Build mode error: ' + data.error);
   }

 } catch (e) {
   thinking.remove();
   showDashboardMessage('assistant', 'Build mode error: ' + e.message);
 }
}

// ── Main send handler ──────────────────────────────────────────────────────

async function sendMessage(inputId) {
const inputElId = inputId || (currentView === 'dashboard' ? 'dashboard-input' : 'chat-input');
const input = document.getElementById(inputElId);
const text = input.value.trim();
if (!text) return;
input.value = '';

if (currentView === 'dashboard') {
  initSessionId();
  showDashboardMessage('user', text);
  if (window._sessionLog) window._sessionLog.push({ role: 'user', content: text });

  // ── Build mode sticky routing ─────────────────────────────────────────
  if (window._buildModeActive) { handleBuildMode(text); return; }

  // ── Explicit triggers ─────────────────────────────────────────────────
  const agentTriggers = ['/agent ', 'agent: ', 'agent do '];
  const isAgentCall = agentTriggers.some(t => text.toLowerCase().startsWith(t));
  if (isAgentCall) { handleAgentAction(text); return; }
  if (text.toLowerCase().startsWith('/council')) { runCouncilHuddle(); return; }
  if (text.toLowerCase().startsWith('/build')) { handleBuildMode(text); return; }

  // ── LLM intent classification ─────────────────────────────────────────
  const intent = await detectIntent(text);
  if (intent === 'build_mode') { handleBuildMode(text); return; }
  if (intent === 'thread_update') { handleThreadUpdate(text); return; }
  if (intent === 'new_project') { handleNewProjectRequest(text); return; }
  if (intent === 'build_request') { handleAgentAction(text); return; }

  // ── Regular chat ──────────────────────────────────────────────────────
  const threads = await fetchAllThreads();
  const repoMap = window._repoMap || null;

  systemContext = buildMasterContext(
    threads,
    window._recentSessions || [],
    repoMap
  );

  chatHistory.push({ role: 'user', content: text });

  const routingPromise = shouldAnalyzeForRouting(text)
    ? analyzeAndRoute(text, threads)
    : Promise.resolve(null);

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
        body: JSON.stringify({ system: systemContext, messages: chatHistory.slice(-MAX_HISTORY_WINDOW) })
      }),
      routingPromise
    ]);

    thinking.remove();
    const data = await chatResponse.json();

    if (data.content && data.content[0]) {
      const reply = data.content[0].text.trim();
      showDashboardMessage('assistant', reply);
      if (window._sessionLog) window._sessionLog.push({ role: 'assistant', content: reply });
      chatHistory.push({ role: 'assistant', content: reply });
      speak(reply);

      const proposalKeywords = ['fred', 'update', 'modify', 'change', 'add', 'build', 'deploy', 'push'];
      const lowerReply = reply.toLowerCase();
      const soundsLikeProposal = proposalKeywords.filter(k => lowerReply.includes(k)).length >= 2;
      if (soundsLikeProposal) {
        showMakeItSoButton(`${text} — ${reply.slice(0, 200)}`);
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

// ── Thread view ───────────────────────────────────────────────────────────
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
    body: JSON.stringify({ system: systemContext, messages: chatHistory.slice(-MAX_HISTORY_WINDOW) })
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
      system: THREAD_UPDATE_PROMPT(threadList),
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
  clearInsightCache(plan.thread_id);
  status.textContent = `Filed to "${plan.thread_name}" — updated.`;
  loadThreads();

} catch(e) {
  status.textContent = 'Filing failed: ' + e.message;
}
}

async function endSession() {
 const log = window._sessionLog || [];
 if (log.length < 2) return;
 try {
   await fred.writeSessionReport(log, window._sessionType || 'chat', window._sessionId);
   const insight = await fred.surface();
   if (insight) showDashboardMessage('assistant', `Fred: ${insight}`);
 } catch(e) { console.error('endSession error:', e); }
 window._sessionLog = [];
 window._sessionId = null;
 window._sessionType = null;
 window._buildChatHistory = [];
 window._buildModeActive = false;
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

// ── Session persistence — layered auto-save ───────────────────────────────────

function getSessionLog() {
 const dashLog = window._sessionLog || [];
 const threadLog = chatHistory.map(m => ({ role: m.role, content: m.content }));
 const combined = [...dashLog];
 threadLog.forEach(m => {
   if (!combined.find(e => e.content === m.content)) combined.push(m);
 });
 return combined;
}

async function triggerAutoSave() {
 initSessionId();
 const log = getSessionLog();
 if (log.length < 2) return;
 await fred.writeSessionReport(log, window._sessionType || 'chat', window._sessionId);
}

document.addEventListener('visibilitychange', () => {
 if (document.visibilityState === 'hidden') triggerAutoSave();
});

setInterval(() => {
 const log = getSessionLog();
 if (log.length >= 2) triggerAutoSave();
}, 10 * 60 * 1000);
