// ─── SELF-MODIFY.JS — Code read, patch, deploy ───────────────────────────────

async function handleSelfModifyRequest(instruction) {
  const msgContainer = currentView === 'dashboard'
    ? document.getElementById('dashboard-messages')
    : document.getElementById('chat-messages');

  const status = document.createElement('div');
  status.className = 'message assistant';
  status.textContent = 'Reading my own code...';
  msgContainer.appendChild(status);
  msgContainer.scrollTop = 999999;

  const targetRepo = currentThread?.github_repo || null;

  try {
    const readRes = await fetch('/api/deploy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'read', repo: targetRepo })
    });
    const readData = await readRes.json();
    if (!readData.success) throw new Error('Could not read code: ' + readData.error);

    const currentCode = readData.content;
    const lines = currentCode.split('\n');
    status.textContent = 'Got it. Thinking through the change...';

    const proposeRes = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system: `You are Mavis's code modification engine. David wants to change app.js.
The file has ${lines.length} lines. Return ONLY a JSON object:
{
  "summary": "One sentence describing the change.",
  "startLine": 42,
  "endLine": 48,
  "replacement": "the new code that replaces those lines"
}
Rules:
- startLine and endLine are 1-indexed and inclusive
- replacement uses \\n for newlines
- No markdown, no explanation, ONLY the JSON object`,
        messages: [{
          role: 'user',
          content: `Instruction: ${instruction}\n\nCurrent file: app.js\n\nCurrent code:\n${currentCode}`
        }]
      })
    });

    const proposeData = await proposeRes.json();
    const raw = proposeData.content[0].text.trim().replace(/```json|```/g, '');
    const proposal = JSON.parse(raw);

    const previewLines = lines.slice(0, proposal.startLine - 1)
      .concat(proposal.replacement.split('\n'))
      .concat(lines.slice(proposal.endLine));
    const updatedCode = previewLines.join('\n');

    status.remove();
    showStagedChange(proposal.summary, updatedCode, msgContainer, targetRepo);

  } catch(e) {
    status.textContent = 'Self-modify failed: ' + e.message;
  }
}

function showStagedChange(summary, updatedCode, container, targetRepo) {
  const div = document.createElement('div');
  div.className = 'message assistant';
  div.id = 'staged-change-msg';
  div.innerHTML = `
    <div style="font-size:13px;color:var(--text-secondary);margin-bottom:6px;letter-spacing:0.05em;">STAGED CHANGE</div>
    <div style="font-size:15px;margin-bottom:14px;">${summary}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button id="confirm-deploy-btn" style="background:var(--purple-bright);color:#fff;border:none;border-radius:8px;padding:9px 18px;font-family:Syne,sans-serif;font-size:12px;font-weight:700;cursor:pointer;">Deploy this</button>
      <button id="cancel-deploy-btn" style="background:var(--white-08);color:var(--text-secondary);border:1px solid var(--border);border-radius:8px;padding:9px 18px;font-family:Syne,sans-serif;font-size:12px;cursor:pointer;">Cancel</button>
    </div>`;
  container.appendChild(div);
  container.scrollTop = 999999;

  document.getElementById('confirm-deploy-btn').onclick = () =>
    confirmDeploy(updatedCode, summary, div, container, targetRepo);
  document.getElementById('cancel-deploy-btn').onclick = () => {
    div.remove();
    const cancelled = document.createElement('div');
    cancelled.className = 'message assistant';
    cancelled.textContent = 'Change cancelled. Nothing was deployed.';
    container.appendChild(cancelled);
  };
}

async function confirmDeploy(updatedCode, summary, stagedDiv, container, targetRepo) {
  stagedDiv.remove();
  const status = document.createElement('div');
  status.className = 'message assistant';
  status.textContent = 'Deploying...';
  container.appendChild(status);
  container.scrollTop = 999999;

  try {
    const deployRes = await fetch('/api/deploy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'write',
        content: updatedCode,
        commitMessage: 'Mavis self-update: ' + summary,
        repo: targetRepo || null
      })
    });
    const deployData = await deployRes.json();
    if (!deployData.success) throw new Error(deployData.error);

    status.innerHTML = `Deployed. Live in ~30 seconds.
      <div style="margin-top:10px;">
        <button onclick="handleRollback(this)" style="background:var(--white-08);color:var(--text-secondary);border:1px solid var(--border);border-radius:8px;padding:7px 14px;font-family:Syne,sans-serif;font-size:11px;cursor:pointer;">↩ Rollback if broken</button>
      </div>`;
  } catch(e) {
    status.textContent = 'Deploy failed: ' + e.message;
  }
}

async function handleRollback(btn) {
  btn.textContent = 'Rolling back...';
  btn.disabled = true;
  try {
    const res = await fetch('/api/deploy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'rollback', repo: currentThread?.github_repo || null })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    btn.closest('.message').textContent = 'Rolled back. Previous version deploying now.';
  } catch(e) {
    btn.textContent = 'Rollback failed: ' + e.message;
    btn.disabled = false;
  }
}
