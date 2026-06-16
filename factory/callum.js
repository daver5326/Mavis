// ─── CALLUM.JS — The Architect. Reads, audits, remembers, plans. ─────────────
// Client-side orchestration only. Callum never writes code. Callum never ships.
// Callum reads everything, flags everything, and hands remediation plans to Fred.

const callum = {

  ready: false,

  // ─── COLD START ──────────────────────────────────────────────────────────
  // Called during boot sequence after Ralph. Loads Callum's persistent state
  // from Supabase. Does NOT trigger an audit — that requires explicit command.

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

  // ─── LOAD FILE HEALTH ────────────────────────────────────────────────────
  // Reads callum_files from Supabase. Callum's persistent codebase memory.

  async loadFileHealth() {
    try {
      const res = await fetch('/api/supabase-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'select',
          table: 'callum_files',
          filters: {}
        })
      });
      const data = await res.json();
      window._callumFiles = data.data || [];
    } catch (e) {
      console.error('Callum: file health load failed', e);
      window._callumFiles = [];
    }
  },

  // ─── LOAD RULES ──────────────────────────────────────────────────────────
  // Reads callum_rules — accumulated codebase-specific architectural knowledge.

  async loadRules() {
    try {
      const res = await fetch('/api/supabase-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'select',
          table: 'callum_rules',
          filters: {}
        })
      });
      const data = await res.json();
      window._callumRules = data.data || [];
    } catch (e) {
      console.error('Callum: rules load failed', e);
      window._callumRules = [];
    }
  },

  // ─── DETECT CALLUM TRIGGER ───────────────────────────────────────────────
  // Returns { isCallum: true, command, args } or { isCallum: false }

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
  // Dispatches to the correct server-side handler via api/callum-audit.
  // All heavy work is server-side. Callum.js owns routing only.

  async routeCommand(command, args) {
    const validCommands = ['audit', 'status', 'file', 'diff', 'diagram', 'plan'];

    if (!validCommands.includes(command)) {
      return {
        success: false,
        message: `Unknown command: /callum ${command}. Valid commands: ${validCommands.join(', ')}`
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

  // ─── GET STATUS SUMMARY ──────────────────────────────────────────────────
  // Quick read from window._callumFiles. No server call needed.
  // Used by other modules to surface Callum's current known state.

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
