// ─── FRED.JS — Pattern observer, health monitor, shop foreman ─────────────
// Session 11 verified

const fred = {

  log: [],
  sessionStart: new Date().toISOString(),

  // ─── OBSERVE ──────────────────────────────────────────────────────────────

  observe(event) {
    this.log.push({ event, timestamp: new Date().toISOString() });
  },

  // ─── SESSION HEALTH REPORT ───────────────────────────────────────────────

  async writeSessionReport(sessionLog) {
    if (!sessionLog || sessionLog.length < 2) return;
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: `You are the Mavis Foreman. You observe how David works — not just what he builds, but how he thinks, decides, and moves. Write a brief session report with three parts: (1) SUMMARY: 2-3 sentences on what was accomplished. (2) PATTERNS: one observation about how David worked today — his energy, decisions, focus, or blocks. (3) NEXT: the single most important thing to do next session. Be direct. No padding.`,
          messages: [{
            role: 'user',
            content: `Session log:\n${sessionLog.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n').slice(0, 3000)}`
          }]
        })
      });
      const data = await response.json();
      if (!data.content || !data.content[0]) return;

      const report = data.content[0].text.trim();
      const patterns = this.getPatterns();

      await fetch('/api/supabase-admin', {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'insert',
          table: 'sessions',
          data: {
            raw_log: sessionLog.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n').slice(0, 5000),
            summary: report,
            key_decisions: '',
            patterns_observed: JSON.stringify(patterns),
            project_tags: []
          }
        })
      });

      await this.patchColdStartDoc(report);

    } catch(e) { console.error('Fred session report error:', e); }
  },

  // ─── PATCH COLD START DOC ────────────────────────────────────────────────

  async patchColdStartDoc(sessionSummary) {
    try {
      const existing = await fetch('/api/supabase-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'select',
          table: 'mavis_config',
          filters: { key: 'living_document_summary' }
        })
      });
      const existingData = await existing.json();
      const currentDoc = existingData.data && existingData.data[0]
        ? existingData.data[0].value
        : '';

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: `You are the Mavis Foreman. You have the current cold start document and a session summary. Update ONLY these three sections based on the session: CURRENT SYSTEM STATE, BUILD LOG, and OPEN QUESTIONS PARKED. Return the complete updated document. No explanation.`,
          messages: [{
            role: 'user',
            content: `Current document:\n${currentDoc.slice(0, 8000)}\n\nSession summary:\n${sessionSummary}`
          }]
        })
      });
      const data = await response.json();
      if (!data.content || !data.content[0]) return;

      const updatedDoc = data.content[0].text.trim();

      await fetch('/api/supabase-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'upsert',
          table: 'mavis_config',
          data: { key: 'living_document_summary', value: updatedDoc }
        })
      });
    } catch(e) { console.error('Fred cold start patch error:', e); }
  },

  // ─── COMMANDMENT HEALTH CHECK ────────────────────────────────────────────

  async healthCheck() {
    try {
      const repoMap = await agent.mapRepo();
      const fileList = Object.entries(repoMap)
        .flatMap(([folder, files]) =>
          files.map(f => folder === 'root' ? f : `${folder}/${f}`)
        )
        .filter(f => f.endsWith('.js') || f.endsWith('.html'));

      const sampleFiles = fileList.slice(0, 5);
      const fileContents = await Promise.all(
        sampleFiles.map(async f => {
          try {
            const result = await agent.readFile(f);
            return `FILE: ${f}\n${result.content.slice(0, 800)}`;
          } catch(e) { return `FILE: ${f}\n[unreadable]`; }
        })
      );

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: `You are the Mavis Foreman conducting a health check. Review these files against these commandments: (1) Single responsibility per file. (2) Modern agentic best practices. (3) Platform and LLM agnostic. (4) Propose, don't act. (5) No corners painted. (6) Factory builds itself. (7) More agentic. (8) Watch cost. (9) Professional code only. (10) Verify before proposing. (11) Token efficiency. (12) Factory audits itself. (13) Verify the full stack. Return JSON: { "health": "green|yellow|red", "findings": ["..."], "recommended_actions": ["..."] }`,
          messages: [{
            role: 'user',
            content: fileContents.join('\n\n---\n\n')
          }]
        })
      });

      const data = await response.json();
      if (!data.content || !data.content[0]) return null;

      const raw = data.content[0].text.trim().replace(/```json|```/g, '');
      const findings = JSON.parse(raw);

      await fetch('/api/supabase-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'upsert',
          table: 'mavis_config',
          data: {
            key: 'last_health_check',
            value: JSON.stringify({ timestamp: new Date().toISOString(), findings })
          }
        })
      });

      return findings;
    } catch(e) {
      console.error('Fred health check error:', e);
      return null;
    }
  },

  // ─── PATTERN ANALYSIS ────────────────────────────────────────────────────

  getPatterns() {
    const counts = {};
    this.log.forEach(entry => {
      counts[entry.event] = (counts[entry.event] || 0) + 1;
    });
    return counts;
  },

  // ─── SURFACE INSIGHT ─────────────────────────────────────────────────────

  async surface() {
    try {
      const sessionsRes = await fetch('/api/supabase-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'select',
          table: 'sessions',
          filters: {}
        })
      });
      const sessionsData = await sessionsRes.json();
      const sessions = sessionsData.data || [];
      if (sessions.length < 2) return null;

      const recentSummaries = sessions
        .slice(0, 5)
        .map(s => s.summary)
        .filter(Boolean)
        .join('\n\n');

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: `You are the Mavis Foreman. You have summaries of recent sessions. Surface one insight David hasn't explicitly noticed — a pattern, a risk, or an opportunity. One sentence. Direct.`,
          messages: [{
            role: 'user',
            content: `Recent session summaries:\n${recentSummaries}`
          }]
        })
      });
      const data = await response.json();
      if (data.content && data.content[0]) return data.content[0].text.trim();
    } catch(e) {}
    return null;
  },

  // ─── PROPOSE PROJECTS ────────────────────────────────────────────────────

  async proposeProjects() {
    try {
      const sessionsRes = await fetch('/api/supabase-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'select', table: 'sessions', filters: {} })
      });
      const sessionsData = await sessionsRes.json();
      const sessions = sessionsData.data || [];
      if (sessions.length < 3) return null;

      const summaries = sessions
        .slice(0, 10)
        .map(s => s.summary)
        .filter(Boolean)
        .join('\n\n');

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: `You are the Mavis Foreman. Based on patterns across sessions, identify if there is a project David should start that he hasn't named yet. If yes, return JSON: {"name": "", "goal": "", "why_now": ""}. If no clear project emerges, return {"name": null}.`,
          messages: [{ role: 'user', content: `Session summaries:\n${summaries}` }]
        })
      });
      const data = await response.json();
      if (!data.content || !data.content[0]) return null;
      const raw = data.content[0].text.trim().replace(/```json|```/g, '');
      const proposal = JSON.parse(raw);
      if (!proposal.name) return null;
      return proposal;
    } catch(e) { return null; }
  }

};
