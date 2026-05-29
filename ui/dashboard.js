async function greetOnLoad() {
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

  try {
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
  } catch(e) {}
}
