// ─── MAIN.JS — Init and event listeners ──────────────────────────────────────

let currentThread = null;
let chatHistory = [];
let systemContext = '';
let currentView = 'dashboard';
let pendingRoute = null;

// ─── INIT ─────────────────────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', async () => {
  initVoice();
  initEventListeners();

  document.getElementById('send-btn').addEventListener('click', () => sendMessage('chat-input'));
  document.getElementById('chat-input').addEventListener('keypress', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage('chat-input'); }
  });
  document.getElementById('dashboard-send').addEventListener('click', () => sendMessage('dashboard-input'));
  document.getElementById('dashboard-input').addEventListener('keypress', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage('dashboard-input'); }
  });
  document.getElementById('new-thread-btn').addEventListener('click', openNewThreadForm);

  // ── Ralph runs first. Nothing boots until he's done. ─────────────────────
  window._sessionLog = [];
  const ralphStatus = await ralph.wakeUp();
  await callum.wakeUp();

  if (ralphStatus.newDay) {
    const brief = ralph.getBrief();
    console.log('Ralph brief (new day):', brief);
  }

  // ── Normal boot sequence ──────────────────────────────────────────────────
  await loadDavidProfile();
  await loadThreads();
  setTimeout(greetOnLoad, 800);
});
