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

  // ─── ROUTE CALLUM COMMAND ────────────────────────────────────────────────
  // Audit is handled separately via runAudit(). All other commands route here.

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
  // Queue-based. Seeds queue, polls process until done.
  // onProgress(message) called after each batch for live UI updates.

  async runAudit(onProgress) {
    try {
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
      let processed = 0;
      onProgress(`Callum: ${total} files queued. Starting analysis...`);

      let done = false;
      while (!done) {
        const batchRes = await fetch('/api/callum-audit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: 'process' })
        });
        const batchData = await batchRes.json();

        if (!batchData.success) {
          return { success: false, message: batchData.error || 'Batch processing failed' };
        }

        processed += batchData.processed || 0;
        done = batchData.done;

        const pct = total > 0 ? Math.round((processed / total) * 100) : 0;
        onProgress(`Callum: Auditing... ${processed}/${total} files (${pct}%)`);
      }

      return { success: true, command: 'audit', filesAudited: processed };

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
