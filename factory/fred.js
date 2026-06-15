// ─── FRED.JS — Pattern observer, health monitor, shop foreman ─────────────
// Session 15 — writeSessionReport now accepts sessionId, upserts by session_id

const fred = {

  log: [],
  sessionStart: new Date().toISOString(),

  observe(event) {
    this.log.push({ event, timestamp: new Date().toISOString() });
  },

  async writeSessionReport(sessionLog, sessionType = 'chat', sessionId = null) {
    if (!sessionLog || sessionLog.length < 2) return;
    try {
      const logText = sessionLog.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n').slice(0, 3000);

      if (sessionType === 'build') {
        const response = await fetch('/api/chat', {
          method: 'POST',
          keepalive: true,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system: `You are the Mavis Foreman reviewing a /build session (Mavis self-development). Return ONLY a JSON object, no markdown, no preamble: { "summary": "2-3 sentences on what was accomplished", "decisions_made": "key decisions, comma-separated or short phrases", "files_changed": "file paths touched, comma-separated", "next_action": "the single most important next step" }`,
            messages: [{
              role: 'user',
              content: `Build session log:\n${logText}`
            }]
          })
        });
        const data = await response.json();
        if (!data.content || !data.content[0]) return;

        const raw = data.content[0].text.trim().replace(/```json|```/g, '');
        let parsed;
        try {
          parsed = JSON.parse(raw);
        } catch (e) {
          parsed = { summary: raw.slice(0, 500), decisions_made: '', files_changed: '', next_action: '' };
        }

        const patterns = this.getPatterns();
        const payload = {
          raw_log: sessionLog.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n').slice(0, 5000),
          summary: parsed.summary || '',
          key_decisions: parsed.decisions_made || '',
          decisions_made: parsed.decisions_made || '',
          files_changed: parsed.files_changed || '',
          next_action: parsed.next_action || '',
          session_type: 'build',
          patterns_observed: JSON.stringify(patterns),
          project_tags: []
        };

        if (sessionId) payload.session_id = sessionId;

        // Upsert: update existing row if session_id matches, else insert
        if (sessionId) {
          await fetch('/api/supabase-admin', {
            method: 'POST',
            keepalive: true,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'upsert',
              table: 'sessions',
              data: payload,
              onConflict: 'session_id'
            })
          });
        } else {
          await fetch('/api/supabase-admin', {
            method: 'POST',
            keepalive: true,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'insert',
              table: 'sessions',
              data: payload
            })
          });
        }

        return;
      }

      // ── Default / chat session path ──
      const response = await fetch('/api/chat', {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: `You are the Mavis Foreman. You observe how David works — not just what he builds, but how he thinks, decides, and moves. Write a brief session report with three parts: (1) SUMMARY: 2-3 sentences on what was accomplished. (2) PATTERNS: one observation about how David worked today — his energy, decisions, focus, or blocks. (3) NEXT: the single most important thing to do next session. Be direct. No padding.`,
          messages: [{
            role: 'user',
            content: `Session log:\n${logText}`
          }]
        })
      });
      const data = await response.json();
      if (!data.content || !data.content[0]) return;

      const report = data.content[0].text.trim();
      const patterns = this.getPatterns();
      const payload = {
        raw_log: sessionLog.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n').slice(0, 5000),
        summary: report,
        key_decisions: '',
        session_type: 'chat',
        patterns_observed: JSON.stringify(patterns),
        project_tags: []
      };

      if (sessionId) payload.session_id = sessionId;

      if (sessionId) {
        await fetch('/api/supabase-admin', {
          method: 'POST',
          keepalive: true,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'upsert',
            table: 'sessions',
            data: payload,
            onConflict: 'session_id'
          })
        });
      } else {
        await fetch('/api/supabase-admin', {
          method: 'POST',
          keepalive: true,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'insert',
            table: 'sessions',
            data: payload
          })
        });
      }

      await this.patchColdStartDoc(report);

    } catch(e) { console.error('Fred session report error:', e); }
  },

  async patchColdStartDoc(sessionSummary) {
    try {
      const existing = await fetch('/api/supabase-admin', {
        method: 'POST',
        keepalive: true,
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

      const timestamp = new Date().toISOString().slice(0, 10);
      const entry = `\n\n---\nSESSION ${timestamp}\n${sessionSummary}`;
      const updatedDoc = currentDoc + entry;

      await fetch('/api/supabase-admin', {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'upsert',
          table: 'mavis_config',
          data: { key: 'living_document_summary', value: updatedDoc }
        })
      });
    } catch(e) { console.error('Fred cold start patch error:', e); }
  },

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

  getPatterns() {
    const counts = {};
    this.log.forEach(entry => {
      counts[entry.event] = (counts[entry.event] || 0) + 1;
    });
    return counts;
  },

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
