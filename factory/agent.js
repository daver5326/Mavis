```javascript
// ─── AGENT.JS — Agentic builder. Reads, writes, rolls back. ───────────────────

import { supabaseQuery, supabaseExec } from '../api/supabase-admin.js';

const agent = {

  // ── Read a file from the repo ──────────────────────────────────────────────
  async readFile(path) {
    const res = await fetch('/api/github', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'read', path })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Read failed');
    return data; // { content, sha }
  },

  // ── List a directory ───────────────────────────────────────────────────────
  async listDir(path = '') {
    const res = await fetch('/api/github', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list', path })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'List failed');
    return data.files; // [{ name, path, type, sha }]
  },

  // ── Write a file to the repo ───────────────────────────────────────────────
  async writeFile(path, content, message, sha = null) {
    const res = await fetch('/api/github', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'write', path, content, message, sha })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Write failed');
    foreman.observe(`agent:write:${path}`);
    return data; // { success, sha }
  },

  // ── Get recent commits ─────────────────────────────────────────────────────
  async getCommits() {
    const res = await fetch('/api/github', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'commits' })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Commits failed');
    return data.commits; // [{ sha, message, date }]
  },

  // ── Map the full repo structure ────────────────────────────────────────────
  async mapRepo() {
    const root = await this.listDir('');
    const folders = root.filter(f => f.type === 'dir');
    const map = { root: root.map(f => f.name) };
    for (const folder of folders) {
      const contents = await this.listDir(folder.path);
      map[folder.name] = contents.map(f => f.name);
    }
    return map;
  },

  // ── Propose a change (David approves before write executes) ───────────────
  async propose(path, newContent, reason) {
    const current = await this.readFile(path);
    return {
      path,
      reason,
      sha: current.sha,
      preview: newContent,
      confirm: async () => {
        return await this.writeFile(path, newContent, `Agent: ${reason}`, current.sha);
      }
    };
  },

  // ── Rollback to a previous commit (escape hatch) ──────────────────────────
  async rollback(stepsBack = 1) {
    const commits = await this.getCommits();
    if (stepsBack >= commits.length) throw new Error('Not enough commit history');
    const target = commits[stepsBack];
    return {
      targetSha: target.sha,
      targetMessage: target.message,
      targetDate: target.date,
      warning: `This will revert to: "${target.message}" — confirm to proceed`
    };
  },

  // ── Query Supabase (SELECT queries) ────────────────────────────────────────
  async supabaseQuery(query, params) {
    return await supabaseQuery(query, params);
  },

  // ── Execute Supabase (INSERT/UPDATE/DELETE) ────────────────────────────────
  async supabaseExec(query, params) {
    return await supabaseExec(query, params);
  }

};
```