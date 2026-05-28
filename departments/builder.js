// ─── BUILDER.JS — Build and new project requests ─────────────────────────────

async function handleBuildRequest(text) {
  const msgContainer = currentView === 'dashboard'
    ? document.getElementById('dashboard-messages')
    : document.getElementById('chat-messages');
  const status = document.createElement('div');
  status.className = 'message assistant';
  status.textContent = 'On it — figuring out what to build...';
  msgContainer.appendChild(status);
  msgContainer.scrollTop = 999999;

  try {
    const planRes = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system: `You are Mavis, a builder. David has requested something to be built.
Respond with ONLY valid JSON:
{
  "table": "snake_case_table_name",
  "thread_name": "Human readable name for this feature",
  "columns": [{"name": "col_name", "type": "text|integer|boolean|timestamptz"}],
  "confirmation": "One sentence telling David exactly what you are building.",
  "ui_description": "Brief description of what the UI should do."
}`,
        messages: [{ role: 'user', content: text }]
      })
    });

    const planData = await planRes.json();
    const raw = planData.content[0].text.trim().replace(/```json|```/g, '');
    const plan = JSON.parse(raw);
    status.textContent = plan.confirmation;

    const schemaRes = await fetch('/api/schema', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create', table: plan.table, columns: plan.columns })
    });
    const schemaData = await schemaRes.json();
    if (!schemaData.success) throw new Error('Schema failed: ' + schemaData.error);

    status.textContent = plan.confirmation + ' Building UI...';

    const uiRes = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system: `You are Mavis building a UI component. Generate a self-contained HTML+JS snippet that:
- Uses the Supabase client already available as window.db
- Matches this color scheme: purple/gold dark theme, CSS variables --purple-bright, --gold, --white-08, --border, --text-primary, --text-secondary
- Uses font-family DM Sans and Syne (already loaded)
- Has a form to add new entries and a list to view recent entries
- Calls Supabase directly: await window.db.from('TABLE_NAME').insert([...]) and .select()
- Is clean, minimal, mobile-friendly
- Returns ONLY the HTML/JS, no explanation, no markdown fences`,
        messages: [{ role: 'user', content: `Build a UI for table "${plan.table}" with columns: ${plan.columns.map(c=>c.name).join(', ')}. ${plan.ui_description}` }]
      })
    });

    const uiData = await uiRes.json();
    const uiHtml = uiData.content[0].text.trim().replace(/```html|```/g, '');

    const { data: newThread, error: threadError } = await insertThread({
      'Thread name': plan.thread_name,
      'Goal': plan.table,
      'Status': 'Active',
      'thread_type': 'feature',
      'custom_ui': uiHtml,
      'platform': 'Mavis'
    });

    if (threadError) throw new Error('Thread save failed: ' + threadError.message);

    const doneMsg = document.createElement('div');
    doneMsg.className = 'message assistant';
    doneMsg.textContent = `Done. "${plan.thread_name}" is ready — find it in your dashboard under Built by Mavis.`;
    msgContainer.appendChild(doneMsg);
    msgContainer.scrollTop = 999999;

    if (currentView === 'dashboard') loadThreads();

  } catch(e) {
    status.textContent = 'Build failed: ' + e.message;
  }
}

async function handleNewProjectRequest(text) {
  const msgContainer = currentView === 'dashboard'
    ? document.getElementById('dashboard-messages')
    : document.getElementById('chat-messages');

  const status = document.createElement('div');
  status.className = 'message assistant';
  status.textContent = 'Planning the new project...';
  msgContainer.appendChild(status);
  msgContainer.scrollTop = 999999;

  try {
    const planRes = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system: `You are Mavis. David wants to create a new external project with its own GitHub repo.
Return ONLY a JSON object:
{
  "repo_name": "kebab-case-repo-name",
  "display_name": "Human Readable Name",
  "description": "One sentence describing the project.",
  "confirmation": "One sentence telling David what you are about to create."
}`,
        messages: [{ role: 'user', content: text }]
      })
    });

    const planData = await planRes.json();
    const raw = planData.content[0].text.trim().replace(/```json|```/g, '');
    const plan = JSON.parse(raw);
    status.textContent = plan.confirmation;

    const repoRes = await fetch('/api/create-repo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: plan.repo_name, description: plan.description })
    });
    const repoData = await repoRes.json();
    if (!repoData.success) throw new Error('Repo creation failed: ' + repoData.error);

    status.textContent = 'Repo created. Scaffolding files...';

    const scaffoldRes = await fetch('/api/scaffold', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        repo: repoData.repo,
        files: [
          {
            path: 'index.html',
            content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${plan.display_name}</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <h1>${plan.display_name}</h1>
  <script src="app.js"></script>
</body>
</html>`
          },
          {
            path: 'style.css',
            content: `* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: sans-serif; background: #0a0a0f; color: #fff; padding: 20px; }`
          },
          {
            path: 'app.js',
            content: `// ${plan.display_name}
// Created by Mavis on ${new Date().toLocaleDateString()}
console.log('${plan.display_name} ready');`
          }
        ]
      })
    });
    const scaffoldData = await scaffoldRes.json();
    if (!scaffoldData.success) throw new Error('Scaffold failed: ' + scaffoldData.error);

    let threadId = currentThread?.id || null;
    if (threadId) {
      await updateThread(threadId, {
        github_repo: repoData.repo,
        'Next step': 'Connect repo to Vercel and start building'
      });
      currentThread.github_repo = repoData.repo;
    } else {
      const { data: newThread } = await insertThread({
        'Thread name': plan.display_name,
        'Goal': plan.description,
        'Status': 'Active',
        'platform': 'Mavis',
        github_repo: repoData.repo,
        'Next step': 'Connect repo to Vercel and start building'
      });
      if (newThread) threadId = newThread.id;
    }

    const hostingUrl = `https://vercel.com/new/import?s=https://github.com/${repoData.repo}`;
    status.innerHTML = `Project ready. <button onclick="window.open('${hostingUrl}','_blank')" style="background:var(--purple-bright);color:#fff;border:none;border-radius:8px;padding:8px 16px;font-family:Syne,sans-serif;font-size:12px;font-weight:700;cursor:pointer;margin-left:8px;">Set Up Hosting</button>`;

    if (currentView === 'dashboard') loadThreads();

  } catch(e) {
    status.textContent = 'Project creation failed: ' + e.message;
  }
}
