// ─── CALLUM.JS — The Architect. Reads, audits, remembers, plans. ─────────────
// Client-side orchestration only. Callum never writes code. Callum never ships.
// Callum reads everything, flags everything, and hands remediation plans to Fred.

const callum = {

  ready: false,

  async wakeUp() {
    try {
      await Promise.all([
        this.loadFileHealth(),
        this.loadRules()
      ]);
      this.ready = true;
      return { ready: true };
    } catch (e) {
      console.error('Callum wake-up error:', e);
      this.ready = false;
      return { ready: false };
    }
  },

  async loadFileHealth() {
    try {
      const res = await fetch('/api/supabase-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'select', table: 'callum_files', filters: {} })
      });
      const data = await res.json();
      window._callumFiles = data.data || [];
    } catch (e) {
      console.error('Callum: file health load failed', e);
      window._callumFiles = [];
    }
  },

  async loadRules() {
    try {
      const res = await fetch('/api/supabase-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'select', table: 'callum_rules', filters: {} })
      });
      const data = await res.json();
      window._callumRules = data.data || [];
    } catch (e) {
      console.error('Callum: rules load failed', e);
      window._callumRules = [];
    }
  },

  detectCallumTrigger(message) {
    const trimmed = message.trim().toLowerCase();
    if (!trimmed.startsWith('/callum')) {
      return { isCallum: false };
    }
    const rest = message.trim().slice('/callum'.length).trim();
    const parts = rest.split(/\s+/);
    const command = parts[0] || 'status';
    const args = parts.slice(1);
    return { isCallum: true, command, args };
  },

  async routeCommand(command, args) {
    const validCommands = ['status', 'file', 'diff', 'diagram', 'plan'];

    if (!validCommands.includes(command)) {
      return {
        success: false,
        message: `Unknown command: /callum ${command}. Valid commands: audit, ${validCommands.join(', ')}`
      };
    }

    try {
      const res = await fetch('/api/callum-audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, args })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return { success: false, message: err.error || `Server error (${res.status})` };
      }

      return await res.json();

    } catch (e) {
      console.error('Callum: route command failed', e);
      return { success: false, message: `Callum command failed: ${e.message}` };
    }
  },

  // ─── RUN AUDIT ───────────────────────────────────────────────────────────
  // Batch API flow:
  //   1. Seed queue with all file paths
  //   2. Submit batch job to Anthropic (all files at once, 50% cheaper)
  //   3. Poll every 30 seconds until batch completes
  //   4. Results written to Supabase automatically on completion
  // onProgress(message) called at each stage for live UI updates.

  async runAudit(onProgress) {
    try {
      // Step 1 — seed queue
      onProgress('Callum: Reading repo file list...');
      const queueRes = await fetch('/api/callum-audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'queue' })
      });
      const queueData = await queueRes.json();

      if (!queueData.success) {
        return { success: false, message: queueData.error || 'Queue seed failed' };
      }

      const total = queueData.queued;
      onProgress(`Callum: ${total} files queued. Fetching contents and submitting batch...`);

      // Step 2 — submit batch job
      const submitRes = await fetch('/api/callum-audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'batch-submit' })
      });
      const submitData = await submitRes.json();

      if (!submitData.success) {
        return { success: false, message: submitData.error || 'Batch submit failed' };
      }

      onProgress(`Callum: Batch submitted (${submitData.submitted} files). Waiting for results — this usually takes 2–5 minutes...`);

      // Step 3 — poll every 30 seconds
      let done = false;
      let pollCount = 0;
      const MAX_POLLS = 60; // 30 minutes max

      while (!done && pollCount < MAX_POLLS) {
        await new Promise(r => setTimeout(r, 30000));
        pollCount++;

        try {
          const pollRes = await fetch('/api/callum-audit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: 'batch-poll' })
          });
          const pollData = await pollRes.json();

          if (!pollData.success) {
            onProgress(`Callum: Poll error — ${pollData.message || 'unknown'}. Retrying...`);
            continue;
          }

          if (pollData.done) {
            done = true;
            return {
              success: true,
              command: 'audit',
              filesAudited: pollData.filesWritten || total
            };
          }

          const elapsed = Math.round(pollCount * 0.5);
          onProgress(`Callum: Still processing... (${elapsed} min elapsed)`);

        } catch (pollErr) {
          onProgress(`Callum: Network error polling — retrying in 30s...`);
        }
      }

      return { success: false, message: 'Audit timed out after 30 minutes. Run /callum status to see partial results.' };

    } catch (e) {
      console.error('Callum: runAudit failed', e);
      return { success: false, message: `Audit failed: ${e.message}` };
    }
  },

  getStatusSummary() {
    const files = window._callumFiles || [];
    if (files.length === 0) {
      return 'Callum has no audit data yet. Run /callum audit to begin.';
    }

    const counts = { stable: 0, fragile: 0, broken: 0, unknown: 0 };
    files.forEach(f => {
      counts[f.status] = (counts[f.status] || 0) + 1;
    });

    const lastVerified = files
      .filter(f => f.last_verified)
      .sort((a, b) => new Date(b.last_verified) - new Date(a.last_verified))[0];

    return [
      `Callum knows ${files.length} files.`,
      `Stable: ${counts.stable} | Fragile: ${counts.fragile} | Broken: ${counts.broken} | Unknown: ${counts.unknown}`,
      lastVerified
        ? `Last audit: ${new Date(lastVerified.last_verified).toLocaleDateString()}`
        : 'No audit run yet.'
    ].join(' ');
  }

};
