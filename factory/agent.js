// ─── AGENT.JS — Agentic builder. Reads, writes, rolls back. ───────────────────

const agent = {

  async readFile(path) {
    const res = await fetch('/api/github', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'read', path })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Read failed');
    return data;
  },

  async listDir(path = '') {
    const res = await fetch('/api/github', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list', path })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'List failed');
    return data.files;
  },

  async writeFile(path, content, message, sha = null) {
    const res = await fetch('/api/github', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'write', path, content, message, sha })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Write failed');
    foreman.observe(`agent:write:${path}`);
    return data;
  },

  async getCommits() {
    const res = await fetch('/api/github', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'commits' })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Commits failed');
    return data.commits;
  },

  async mapRepo() {
    const res = await fetch('/api/github', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'tree' })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Tree failed');

    const map = {};
    for (const item of data.tree) {
      if (item.type !== 'blob') continue;
      const parts = item.path.split('/');
      if (parts.length === 1) {
        if (!map['root']) map['root'] = [];
        map['root'].push(parts[0]);
      } else {
        const folder = parts[0];
        if (!map[folder]) map[folder] = [];
        map[folder].push(parts.slice(1).join('/'));
      }
    }
    return map;
  },

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

  async supabaseQuery(table, filters = {}) {
    const res = await fetch('/api/supabase-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'select', table, filters })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Query failed');
    return data.data;
  },

  async supabaseExec(action, table, payload = {}) {
    const res = await fetch('/api/supabase-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, table, ...payload })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Exec failed');
    return data.data;
  },

  async supabaseSQL(query) {
    const res = await fetch('/api/supabase-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'sql', query })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'SQL failed');
    return data.data;
  }

};
