// ─── AGENT-ACTIONS.JS — Tool-use action handlers ──────────────────────────────

let _pendingDbExec = null;

async function handleAgentAction(text) {
  const msgContainer = document.getElementById('dashboard-messages');
  const status = document.createElement('div');
  status.className = 'message assistant';
  status.textContent = 'Planning action...';
  msgContainer.appendChild(status);
  msgContainer.scrollTop = 999999;

  try {
    const repoMap = await agent.mapRepo();

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

async function handleDbExec(params, reason, msgContainer, status) {
  _pendingDbExec = params;
  status.remove();
  const proposal = document.createElement('div');
  proposal.className = 'message assistant';
  proposal.innerHTML = `
    <div style="margin-bottom:8px">Proposed database operation:</div>
    <div style="font-size:12px;opacity:0.7;margin-bottom:12px">${reason}</div>
    <div style="font-size:11px;background:#1a1a1a;padding:8px;border-radius:6px;margin-bottom:12px">
      ${params.action} → ${params.table}
    </div>
    <div style="display:flex;gap:8px">
      <button onclick="confirmDbExec(this)"
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

async function handleDbQuery(params, reason, msgContainer, status) {
  status.textContent = `Querying ${params.table}...`;
  try {
    const result = await agent.supabaseQuery(params.table, params.filters || {});
    status.textContent = `Query result from ${params.table}: ${JSON.stringify(result).slice(0, 200)}`;
  } catch(e) {
    status.textContent = 'Query failed: ' + e.message;
  }
}

async function handleMultiStep(steps, reason, msgContainer, status) {
  status.textContent = `Planning ${steps.length} steps...`;
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
  const params = _pendingDbExec;
  if (!params) return;
  const msgEl = btn.closest('.message');
  btn.textContent = 'Executing...';
  btn.disabled = true;
  try {
    await agent.supabaseExec(params.action, params.table, params);
    msgEl.innerHTML = 'Executed successfully.';
    _pendingDbExec = null;
  } catch(e) {
    msgEl.innerHTML = 'Execution failed: ' + e.message;
  }
}
