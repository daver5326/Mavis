// ─── TRIAGE.JS — Triage logic and screen ─────────────────────────────────────

const TRIAGE_DAYS = 14;

function getLastActivityDate(thread) {
  if (thread['last_activity_at']) return new Date(thread['last_activity_at']);
  if (thread['created_at']) return new Date(thread['created_at']);
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

async function triageReactivate(id) {
  const thread = await fetchThread(id);
  if (!thread) return;
  const newProgress = (thread['Current progress'] || '') + '\n\n[Reactivated ' + new Date().toLocaleDateString() + ']';
  await updateThread(id, { 'Current progress': newProgress, 'last_activity_at': new Date().toISOString() });
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
  await updateThread(id, { 'Status': 'Complete', 'last_activity_at': new Date().toISOString() });
  clearInsightCache(id);
  setTimeout(() => loadThreads(), 500);
  backToDashboard();
  setTimeout(() => showDashboardMessage('assistant', 'Archived. Good call — keeping things clean.'), 300);
}
