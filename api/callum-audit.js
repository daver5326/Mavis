// ─── api/callum-audit.js ─────────────────────────────────────────────────────
// Server-side endpoint for all /callum commands.
// Accepts { command, args } and dispatches to the correct handler.
// Reads files via shared core/fetch utility. Analyzes via Claude Batch API.
// Writes to Supabase. Self-contained — no agent.js dependency.
//
// AUDIT FLOW (Batch API, 50% cost reduction):
//   1. /callum audit → seeds callum_queue, submits Anthropic batch job, returns immediately
//   2. Client polls → POST { command: 'batch-poll' } → checks status, writes results if done
//   3. Client repeats every 30s until { done: true }

const { fetchFileFromGitHub } = require('../core/fetch');

const CALLUM_MODEL = 'claude-sonnet-4-6';
const BATCH_SIZE = 5;
const ANTHROPIC_API = 'https://api.anthropic.com/v1';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { command, args } = req.body;
    if (!command) {
      return res.status(400).json({ error: 'command is required' });
    }

    const githubToken = process.env.GITHUB_TOKEN;
    const repo = process.env.GITHUB_REPO || 'daver5326/Mavis';
    const branch = process.env.GITHUB_BRANCH || 'main';
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
    const claudeKey = process.env.CLAUDE_API_KEY;

    if (!githubToken || !supabaseUrl || !supabaseKey || !claudeKey) {
      return res.status(500).json({ error: 'Missing required environment variables' });
    }

    const ctx = { githubToken, repo, branch, supabaseUrl, supabaseKey, claudeKey };

    switch (command) {
      case 'queue':        return await seedQueue(ctx, res);
      case 'batch-submit': return await submitBatch(ctx, res);
      case 'batch-poll':   return await pollBatch(ctx, res);
      case 'process':      return await processBatch(ctx, res);
      case 'status':       return await runStatus(ctx, res);
      case 'file':         return await runFileAudit(ctx, args, res);
      case 'diff':         return await runDiff(ctx, res);
      case 'diagram':      return await runDiagram(ctx, res);
      case 'plan':         return await runPlan(ctx, res);
      default:
        return res.status(400).json({ error: `Unknown command: ${command}` });
    }

  } catch (e) {
    console.error('callum-audit error:', e);
    return res.status(500).json({ error: e.message });
  }
};

// ─── FETCH REPO FILE LIST ────────────────────────────────────────────────────

async function fetchRepoFileList({ githubToken, repo, branch }) {
  const url = `https://api.github.com/repos/${repo}/git/trees/${branch}?recursive=1`;
  const res = await fetch(url, {
    headers: {
      Authorization: `token ${githubToken}`,
      Accept: 'application/vnd.github.v3+json'
    }
  });
  if (!res.ok) throw new Error(`GitHub tree fetch failed (${res.status})`);
  const data = await res.json();
  return (data.tree || [])
    .filter(item => item.type === 'blob')
    .filter(item => !item.path.startsWith('node_modules/'))
    .filter(item => !item.path.startsWith('.next/'))
    .filter(item => item.path.match(/\.(js|json|css|html|md)$/))
    .map(item => item.path);
}

// ─── BUILD ANALYSIS PROMPT ───────────────────────────────────────────────────

function buildAnalysisPrompt(file) {
  if (file.error) return null;
  return `You are Callum, a precise Scottish code architect auditing the Mavis codebase.
Analyze this file and respond ONLY with a JSON object — no preamble, no markdown fences.

File: ${file.path}
Content:
${file.content.slice(0, 3000)}${file.content.length > 3000 ? '\n[TRUNCATED]' : ''}

Respond with exactly this structure:
{
  "status": "stable" | "fragile" | "broken" | "unknown",
  "known_issues": "comma-separated list of issues, or empty string if none",
  "dependencies": "comma-separated list of files or globals this file depends on",
  "notes": "one sentence architectural assessment"
}

Status definitions:
- stable: single responsibility, clean dependencies, no obvious bugs
- fragile: works but has coupling issues, mixed responsibilities, or known bugs
- broken: has confirmed bugs, missing dependencies, or will not execute correctly
- unknown: cannot assess from content alone`;
}

// ─── WRITE TO SUPABASE ───────────────────────────────────────────────────────

async function upsertFileHealth(finding, sessionId, { supabaseUrl, supabaseKey }) {
  const now = new Date().toISOString();

  await fetch(`${supabaseUrl}/rest/v1/callum_files`, {
    method: 'POST',
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates'
    },
    body: JSON.stringify({
      file_path: finding.path,
      status: finding.status,
      last_verified: now,
      known_issues: finding.known_issues,
      dependencies: finding.dependencies,
      notes: finding.notes,
      updated_at: now
    })
  });

  if (finding.known_issues) {
    await fetch(`${supabaseUrl}/rest/v1/callum_audit_log`, {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        file_path: finding.path,
        finding: finding.known_issues,
        severity: finding.status === 'broken' ? 'critical'
          : finding.status === 'fragile' ? 'high' : 'info',
        session_id: sessionId
      })
    });
  }
}

// ─── COMMAND: QUEUE ──────────────────────────────────────────────────────────

async function seedQueue(ctx, res) {
  const { supabaseUrl, supabaseKey } = ctx;

  await fetch(`${supabaseUrl}/rest/v1/callum_queue?processed=eq.false`, {
    method: 'DELETE',
    headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` }
  });

  const filePaths = await fetchRepoFileList(ctx);

  await fetch(`${supabaseUrl}/rest/v1/callum_queue`, {
    method: 'POST',
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify(filePaths.map(p => ({ file_path: p, processed: false })))
  });

  return res.status(200).json({ success: true, command: 'queue', queued: filePaths.length });
}

// ─── COMMAND: BATCH-SUBMIT ───────────────────────────────────────────────────

async function submitBatch(ctx, res) {
  const { supabaseUrl, supabaseKey, claudeKey } = ctx;

  const queueRes = await fetch(
    `${supabaseUrl}/rest/v1/callum_queue?processed=eq.false&select=id,file_path`,
    { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
  );
  const queueItems = await queueRes.json();

  if (!queueItems.length) {
    return res.status(200).json({ success: true, command: 'batch-submit', queued: 0, message: 'Queue is empty' });
  }

  const files = [];
  for (let i = 0; i < queueItems.length; i += 10) {
    const chunk = queueItems.slice(i, i + 10);
    const fetched = await Promise.allSettled(chunk.map(item => fetchFileFromGitHub(item.file_path)));
    fetched.forEach((result, idx) => {
      if (result.status === 'fulfilled') {
        files.push({ ...result.value, queueId: chunk[idx].id });
      }
    });
  }

  const batchRequests = files
    .filter(f => !f.error)
    .map(f => ({
      custom_id: f.queueId,
      params: {
        model: CALLUM_MODEL,
        max_tokens: 500,
        messages: [{ role: 'user', content: buildAnalysisPrompt(f) }]
      }
    }));

  if (!batchRequests.length) {
    return res.status(200).json({ success: false, command: 'batch-submit', message: 'No valid files to analyze' });
  }

  const batchRes = await fetch(`${ANTHROPIC_API}/messages/batches`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': claudeKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({ requests: batchRequests })
  });

  if (!batchRes.ok) {
    const err = await batchRes.json().catch(() => ({}));
    return res.status(500).json({ success: false, error: `Batch submit failed: ${err.error?.message || batchRes.status}` });
  }

  const batchData = await batchRes.json();
  const batchId = batchData.id;

  await Promise.all(queueItems.map(item =>
    fetch(`${supabaseUrl}/rest/v1/callum_queue?id=eq.${item.id}`, {
      method: 'PATCH',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ batch_id: batchId })
    })
  ));

  return res.status(200).json({
    success: true,
    command: 'batch-submit',
    batchId,
    submitted: batchRequests.length,
    status: batchData.processing_status
  });
}

// ─── COMMAND: BATCH-POLL ─────────────────────────────────────────────────────

async function pollBatch(ctx, res) {
  const { supabaseUrl, supabaseKey, claudeKey } = ctx;

  const queueRes = await fetch(
    `${supabaseUrl}/rest/v1/callum_queue?processed=eq.false&batch_id=not.is.null&limit=1&select=batch_id`,
    { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
  );
  const queueItems = await queueRes.json();

  if (!queueItems.length) {
    return res.status(200).json({ success: true, command: 'batch-poll', done: true, message: 'No active batch found' });
  }

  const batchId = queueItems[0].batch_id;

  const statusRes = await fetch(`${ANTHROPIC_API}/messages/batches/${batchId}`, {
    headers: { 'x-api-key': claudeKey, 'anthropic-version': '2023-06-01' }
  });
  const batchStatus = await statusRes.json();

  if (batchStatus.processing_status !== 'ended') {
    return res.status(200).json({
      success: true,
      command: 'batch-poll',
      done: false,
      status: batchStatus.processing_status,
      counts: batchStatus.request_counts
    });
  }

  const resultsRes = await fetch(batchStatus.results_url, {
    headers: { 'x-api-key': claudeKey, 'anthropic-version': '2023-06-01' }
  });
  const resultsText = await resultsRes.text();

  const results = resultsText
    .split('\n')
    .filter(Boolean)
    .map(line => { try { return JSON.parse(line); } catch { return null; } })
    .filter(Boolean);

  const sessionId = `callum-batch-${Date.now()}`;
  let written = 0;

  for (const result of results) {
    if (result.result?.type !== 'succeeded') continue;

    const queueId = result.custom_id;
    const text = result.result.message?.content?.[0]?.text || '{}';

    const itemRes = await fetch(
      `${supabaseUrl}/rest/v1/callum_queue?id=eq.${queueId}&select=file_path`,
      { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
    );
    const items = await itemRes.json();
    if (!items.length) continue;

    try {
      const clean = text.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(clean);
      await upsertFileHealth({
        path: items[0].file_path,
        status: parsed.status || 'unknown',
        known_issues: parsed.known_issues || '',
        dependencies: parsed.dependencies || '',
        notes: parsed.notes || ''
      }, sessionId, ctx);
      written++;
    } catch {
      await upsertFileHealth({
        path: items[0].file_path,
        status: 'unknown',
        known_issues: 'Could not parse analysis response',
        dependencies: '',
        notes: ''
      }, sessionId, ctx);
    }

    await fetch(`${supabaseUrl}/rest/v1/callum_queue?id=eq.${queueId}`, {
      method: 'PATCH',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ processed: true })
    });
  }

  return res.status(200).json({
    success: true,
    command: 'batch-poll',
    done: true,
    filesWritten: written,
    counts: batchStatus.request_counts
  });
}

// ─── COMMAND: PROCESS (legacy fallback) ──────────────────────────────────────

async function processBatch(ctx, res) {
  const { supabaseUrl, supabaseKey, claudeKey } = ctx;
  const sessionId = `callum-audit-${Date.now()}`;

  const queueRes = await fetch(
    `${supabaseUrl}/rest/v1/callum_queue?processed=eq.false&order=created_at.asc&limit=${BATCH_SIZE}&select=id,file_path`,
    { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
  );
  const batch = await queueRes.json();

  if (!batch.length) {
    return res.status(200).json({ success: true, command: 'process', done: true, processed: 0 });
  }

  const results = { stable: 0, fragile: 0, broken: 0, unknown: 0 };
  await Promise.all(batch.map(async (item) => {
    try {
      const file = await fetchFileFromGitHub(item.file_path);
      const prompt = buildAnalysisPrompt(file);
      if (!prompt) { results.unknown++; return; }

      const response = await fetch(`${ANTHROPIC_API}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': claudeKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({ model: CALLUM_MODEL, max_tokens: 500, messages: [{ role: 'user', content: prompt }] })
      });

      const data = await response.json();
      const text = data.content?.[0]?.text || '{}';
      const clean = text.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(clean);
      const finding = {
        path: item.file_path,
        status: parsed.status || 'unknown',
        known_issues: parsed.known_issues || '',
        dependencies: parsed.dependencies || '',
        notes: parsed.notes || ''
      };
      await upsertFileHealth(finding, sessionId, ctx);
      results[finding.status] = (results[finding.status] || 0) + 1;
    } catch {
      results.unknown++;
    }

    await fetch(`${supabaseUrl}/rest/v1/callum_queue?id=eq.${item.id}`, {
      method: 'PATCH',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ processed: true })
    });
  }));

  const remainingRes = await fetch(
    `${supabaseUrl}/rest/v1/callum_queue?processed=eq.false&select=id`,
    { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}`, Prefer: 'count=exact' } }
  );
  const remaining = parseInt(remainingRes.headers.get('content-range')?.split('/')[1] || '0');

  return res.status(200).json({
    success: true,
    command: 'process',
    done: remaining === 0,
    processed: batch.length,
    remaining,
    results
  });
}

// ─── COMMAND: STATUS ─────────────────────────────────────────────────────────

async function runStatus(ctx, res) {
  const { supabaseUrl, supabaseKey } = ctx;
  const response = await fetch(
    `${supabaseUrl}/rest/v1/callum_files?order=status.asc&select=file_path,status,known_issues,last_verified`,
    { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
  );
  const files = await response.json();

  return res.status(200).json({
    success: true,
    command: 'status',
    summary: {
      total: files.length,
      broken: files.filter(f => f.status === 'broken').length,
      fragile: files.filter(f => f.status === 'fragile').length,
      stable: files.filter(f => f.status === 'stable').length,
      unknown: files.filter(f => f.status === 'unknown').length
    },
    broken: files.filter(f => f.status === 'broken'),
    fragile: files.filter(f => f.status === 'fragile')
  });
}

// ─── COMMAND: FILE ───────────────────────────────────────────────────────────

async function runFileAudit(ctx, args, res) {
  const filePath = args[0];
  if (!filePath) {
    return res.status(400).json({ error: '/callum file requires a file path argument' });
  }
  const sessionId = `callum-file-${Date.now()}`;
  const file = await fetchFileFromGitHub(filePath);

  if (file.error) {
    return res.status(200).json({ success: false, command: 'file', error: file.error });
  }

  const prompt = buildAnalysisPrompt(file);
  const response = await fetch(`${ANTHROPIC_API}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ctx.claudeKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({ model: CALLUM_MODEL, max_tokens: 500, messages: [{ role: 'user', content: prompt }] })
  });

  const data = await response.json();
  const text = data.content?.[0]?.text || '{}';
  const clean = text.replace(/```json|```/g, '').trim();
  const parsed = JSON.parse(clean);
  const finding = {
    path: filePath,
    status: parsed.status || 'unknown',
    known_issues: parsed.known_issues || '',
    dependencies: parsed.dependencies || '',
    notes: parsed.notes || ''
  };
  await upsertFileHealth(finding, sessionId, ctx);
  return res.status(200).json({ success: true, command: 'file', finding });
}

// ─── COMMAND: DIFF ───────────────────────────────────────────────────────────

async function runDiff(ctx, res) {
  const { supabaseUrl, supabaseKey } = ctx;
  const knownRes = await fetch(
    `${supabaseUrl}/rest/v1/callum_files?order=last_verified.asc&limit=1&select=last_verified`,
    { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
  );
  const known = await knownRes.json();
  const since = known[0]?.last_verified || new Date(0).toISOString();

  const commitsRes = await fetch(
    `https://api.github.com/repos/${ctx.repo}/commits?since=${since}&sha=${ctx.branch}`,
    { headers: { Authorization: `token ${ctx.githubToken}`, Accept: 'application/vnd.github.v3+json' } }
  );
  const commits = await commitsRes.json();

  const changedPaths = new Set();
  for (const commit of commits.slice(0, 20)) {
    const detailRes = await fetch(
      `https://api.github.com/repos/${ctx.repo}/commits/${commit.sha}`,
      { headers: { Authorization: `token ${ctx.githubToken}`, Accept: 'application/vnd.github.v3+json' } }
    );
    const detail = await detailRes.json();
    (detail.files || []).forEach(f => changedPaths.add(f.filename));
  }

  const sessionId = `callum-diff-${Date.now()}`;
  const results = { stable: 0, fragile: 0, broken: 0, unknown: 0 };

  for (const filePath of changedPaths) {
    if (!filePath.match(/\.(js|json|css|html|md)$/)) continue;
    const file = await fetchFileFromGitHub(filePath);
    if (file.error) { results.unknown++; continue; }
    const prompt = buildAnalysisPrompt(file);
    const response = await fetch(`${ANTHROPIC_API}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ctx.claudeKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: CALLUM_MODEL, max_tokens: 500, messages: [{ role: 'user', content: prompt }] })
    });
    const data = await response.json();
    const text = data.content?.[0]?.text || '{}';
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    const finding = {
      path: filePath,
      status: parsed.status || 'unknown',
      known_issues: parsed.known_issues || '',
      dependencies: parsed.dependencies || '',
      notes: parsed.notes || ''
    };
    await upsertFileHealth(finding, sessionId, ctx);
    results[finding.status] = (results[finding.status] || 0) + 1;
  }

  return res.status(200).json({
    success: true,
    command: 'diff',
    filesChanged: changedPaths.size,
    filesAudited: Object.values(results).reduce((a, b) => a + b, 0),
    results
  });
}

// ─── COMMAND: DIAGRAM ────────────────────────────────────────────────────────

async function runDiagram(ctx, res) {
  const { supabaseUrl, supabaseKey } = ctx;
  const response = await fetch(
    `${supabaseUrl}/rest/v1/callum_files?select=file_path,dependencies,status`,
    { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
  );
  const files = await response.json();

  if (!files.length) {
    return res.status(200).json({ success: false, command: 'diagram', message: 'No audit data yet. Run /callum audit first.' });
  }

  const lines = ['graph TD'];
  files.forEach(file => {
    const node = file.file_path.replace(/[^a-zA-Z0-9]/g, '_');
    const label = file.file_path.split('/').pop();
    const style = file.status === 'broken' ? ':::broken' : file.status === 'fragile' ? ':::fragile' : '';
    lines.push(`  ${node}["${label}"]${style}`);
    if (file.dependencies) {
      file.dependencies.split(',').map(d => d.trim()).filter(Boolean).forEach(dep => {
        lines.push(`  ${node} --> ${dep.replace(/[^a-zA-Z0-9]/g, '_')}`);
      });
    }
  });
  lines.push('  classDef broken fill:#ff6b6b,stroke:#c0392b');
  lines.push('  classDef fragile fill:#ffd93d,stroke:#f0932b');

  return res.status(200).json({ success: true, command: 'diagram', mermaid: lines.join('\n') });
}

// ─── COMMAND: PLAN ───────────────────────────────────────────────────────────

async function runPlan(ctx, res) {
  const { supabaseUrl, supabaseKey } = ctx;
  const response = await fetch(
    `${supabaseUrl}/rest/v1/callum_files?status=in.(broken,fragile)&order=status.asc&select=file_path,status,known_issues,dependencies`,
    { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
  );
  const files = await response.json();

  if (!files.length) {
    return res.status(200).json({ success: true, command: 'plan', message: 'No broken or fragile files found. Codebase is clean.' });
  }

  return res.status(200).json({
    success: true,
    command: 'plan',
    itemCount: files.length,
    plan: files.map((f, i) => ({
      priority: i + 1,
      file: f.file_path,
      severity: f.status,
      issues: f.known_issues,
      dependencies: f.dependencies,
      action: `Review and remediate ${f.file_path} — ${f.known_issues}`
    }))
  });
}
