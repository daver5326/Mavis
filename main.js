// ─── MAIN.JS — Init and event listeners ──────────────────────────────────────

let currentThread = null;
let chatHistory = [];
let systemContext = '';
let currentView = 'dashboard';
let pendingRoute = null;

// ─── INIT ─────────────────────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', () => {
  initVoice();

  document.getElementById('send-btn').addEventListener('click', () => sendMessage('chat-input'));
  document.getElementById('chat-input').addEventListener('keypress', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage('chat-input'); }
  });
  document.getElementById('dashboard-send').addEventListener('click', () => sendMessage('dashboard-input'));
  document.getElementById('dashboard-input').addEventListener('keypress', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage('dashboard-input'); }
  });
  document.getElementById('new-thread-btn').addEventListener('click', openNewThreadForm);

  loadDavidProfile().then(() => {
    loadThreads().then(() => {
      setTimeout(greetOnLoad, 800);
    });
  });
});
