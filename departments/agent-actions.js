// ─── AGENT-ACTIONS.JS — Tool-use action handlers ──────────────────────────────

let _pendingDbExec = null;
let _pendingBuildProposal = null;

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
- dbExec: execute a database operation
  params: { action ("insert"|"upsert"|"update"|"delete"|"sql"), table, data?, filters?, query? }
  Use "upsert" when the key may already exist and should be replaced.
  Use "insert" only for new records that are guaranteed not to exist.
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

  const previewDiv = document.createElement('div');
  previewDiv.style.marginBottom = '8px';
  previewDiv.innerHTML = `${current ? 'Proposed change to' : 'Proposed new file'} <strong>${params.file}</strong>:`;

  const reasonDiv = document.createElement('div');
  reasonDiv.style.cssText = 'font-size:12px;opacity:0.7;margin-bottom:12px';
  reasonDiv.textContent = reason;

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:8px';

  const approveBtn = document.createElement('button');
  approveBtn.textContent = 'Make it so';
  approveBtn.style.cssText = 'background:#7c3aed;color:white;border:none;padding:8px 16px;border-radius:8px;font-size:14px;cursor:pointer';

  const rejectBtn = document.createElement('button');
  rejectBtn.textContent = 'Reject';
  rejectBtn.style.cssText = 'background:#333;color:white;border:none;padding:8px 16px;border-radius:8px;font-size:14px;cursor:pointer';

  approveBtn.addEventListener('click', async () => {
    approveBtn.textContent = 'Executing...';
    approveBtn.disabled = true;
    try {
      await agent.writeFile(params.file, newContent, `Agent: update ${params.file}`, current ? current.sha : null);
      proposal.innerHTML = `Done. ${params.file} updated and deployed.`;
    } catch(e) {
      proposal.innerHTML = `Failed: ${e.message}`;
    }
  });

  rejectBtn.addEventListener('click', () => proposal.remove());

  btnRow.appendChild(approveBtn);
  btnRow.appendChild(rejectBtn);
  proposal.appendChild(previewDiv);
  proposal.appendChild(reasonDiv);
  proposal.appendChild(btnRow);
  msgContainer.appendChild(proposal);
  msgContainer.scrollTop = 999999;
}

async function handleDbExec(params, reason, msgContainer, status) {
  _pendingDbExec = params;
  status.remove();

  const proposal = document.createElement('div');
  proposal.className = 'message assistant';

  const titleDiv = document.createElement('div');
  titleDiv.style.marginBottom = '8px';
  titleDiv.textContent = 'Proposed database operation:';

  const reasonDiv = document.createElement('div');
  reasonDiv.style.cssText = 'font-size:12px;opacity:0.7;margin-bottom:12px';
  reasonDiv.textContent = reason;

  const queryDiv = document.createElement('div');
  queryDiv.style.cssText = 'font-size:11px;background:#1a1a1a;padding:8px;border-radius:6px;margin-bottom:12px';
  queryDiv.textContent = `${params.action} → ${params.action === 'sql' ? params.query : params.table}`;

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:8px';

  const approveBtn = document.createElement('button');
  approveBtn.textContent = 'Make it so';
  approveBtn.style.cssText = 'background:#7c3aed;color:white;border:none;padding:8px 16px;border-radius:8px;font-size:14px;cursor:pointer';

  const rejectBtn = document.createElement('button');
  rejectBtn.textContent = 'Reject';
  rejectBtn.style.cssText = 'background:#333;color:white;border:none;padding:8px 16px;border-radius:8px;font-size:14px;cursor:pointer';

  approveBtn.addEventListener('click', async () => {
    const p = _pendingDbExec;
    if (!p) return;
    approveBtn.textContent = 'Executing...';
    approveBtn.disabled = true;
    try {
      if (p.action === 'sql') {
        await agent.supabaseSQL(p.query);
      } else {
        await agent.supabaseExec(p.action, p.table, p);
      }
      proposal.innerHTML = 'Done.';
      _pendingDbExec = null;
    } catch(e) {
      proposal.innerHTML = 'Failed: ' + e.message;
    }
  });

  rejectBtn.addEventListener('click', () => {
    _pendingDbExec = null;
    proposal.remove();
  });

  btnRow.appendChild(approveBtn);
  btnRow.appendChild(rejectBtn);
  proposal.appendChild(titleDiv);
  proposal.appendChild(reasonDiv);
  proposal.appendChild(queryDiv);
  proposal.appendChild(btnRow);
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

function showMakeItSoButton(instruction) {
  const msgContainer = document.getElementById('dashboard-messages');
  const div = document.createElement('div');
  div.className = 'message assistant';

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:8px;margin-top:8px';

  const makeItSoBtn = document.createElement('button');
  makeItSoBtn.textContent = 'Make it so';
  makeItSoBtn.style.cssText = 'background:#7c3aed;color:white;border:none;padding:8px 16px;border-radius:8px;font-size:14px;cursor:pointer';

  const dismissBtn = document.createElement('button');
  dismissBtn.textContent = 'Not yet';
  dismissBtn.style.cssText = 'background:#333;color:white;border:none;padding:8px 16px;border-radius:8px;font-size:14px;cursor:pointer';

  makeItSoBtn.addEventListener('click', () => {
    div.remove();
    if (window._buildModeActive) {
      handleBuildMode('yes');
    } else {
      handleAgentAction(instruction);
    }
  });

  dismissBtn.addEventListener('click', () => div.remove());

  btnRow.appendChild(makeItSoBtn);
  btnRow.appendChild(dismissBtn);
  div.appendChild(btnRow);
  msgContainer.appendChild(div);
  msgContainer.scrollTop = 999999;
}
