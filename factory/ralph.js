// ─── RALPH.JS — The Reader. Fetches, populates globals, briefs the system. ───
// Read-only by design. Ralph never writes. Ralph never acts. Ralph knows.

const ralph = {

  ready: false,

  // ─── WAKE UP ─────────────────────────────────────────────────────────────
  // Called first on every cold start. Nothing else runs until this resolves.

  async wakeUp() {
    try {
      await Promise.all([
        this.fetchLivingDocSummary(),
        this.fetchRecentSessions(),
        this.fetchRepoMap(),
        this.fetchDavidProfile(),
        this.fetchActiveThreads()
      ]);

      this.ready = true;
      const isNewDay = this.detectNewDay();
      return { ready: true, newDay: isNewDay };

    } catch(e) {
      console.error('Ralph wake-up error:', e);
      this.ready = false;
      return { ready: false, newDay: false };
    }
  },

  // ─── FETCH LIVING DOC SUMMARY ─────────────────────────────────────────────

  async fetchLivingDocSummary() {
    try {
      const res = await fetch('/api/supabase-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'select',
          table: 'mavis_config',
          filters: { key: 'living_document_summary' }
        })
      });
      const data = await res.json();
      window._livingDocSummary = data.data && data.data[0]
        ? data.data[0].value
        : '';
    } catch(e) {
      console.error('Ralph: living doc summary fetch failed', e);
      window._livingDocSummary = '';
    }
  },

  // ─── FETCH RECENT SESSIONS ───────────────────────────────────────────────

  async fetchRecentSessions() {
    try {
      const res = await fetch('/api/supabase-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'select',
          table: 'sessions',
          filters: {},
          limit: 5,
          order: { column: 'created_at', ascending: false }
        })
      });
      const data = await res.json();
      window._recentSessions = data.data || [];
    } catch(e) {
      console.error('Ralph: recent sessions fetch failed', e);
      window._recentSessions = [];
    }
  },

  // ─── FETCH REPO MAP ──────────────────────────────────────────────────────

  async fetchRepoMap() {
    try {
      window._repoMap = await agent.mapRepo();
    } catch(e) {
      console.error('Ralph: repo map fetch failed', e);
      window._repoMap = {};
    }
  },

  // ─── FETCH DAVID PROFILE ─────────────────────────────────────────────────

  async fetchDavidProfile() {
    try {
      const res = await fetch('/api/supabase-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'select',
          table: 'david',
          filters: {}
        })
      });
      const data = await res.json();
      window._davidProfile = data.data && data.data[0]
        ? data.data[0]
        : {};
    } catch(e) {
      console.error('Ralph: David profile fetch failed', e);
      window._davidProfile = {};
    }
  },

  // ─── FETCH ACTIVE THREADS ────────────────────────────────────────────────

  async fetchActiveThreads() {
    try {
      const res = await fetch('/api/supabase-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'select',
          table: 'Threads',
          filters: { Status: 'Active' }
        })
      });
      const data = await res.json();
      window._activeThreads = data.data || [];
    } catch(e) {
      console.error('Ralph: active threads fetch failed', e);
      window._activeThreads = [];
    }
  },

  // ─── DETECT NEW DAY ──────────────────────────────────────────────────────

  detectNewDay() {
    if (!window._recentSessions || window._recentSessions.length === 0) return true;
    const lastSession = window._recentSessions[0];
    if (!lastSession.created_at) return true;
    const lastDate = new Date(lastSession.created_at).toDateString();
    const today = new Date().toDateString();
    return lastDate !== today;
  },

  // ─── BRIEF ───────────────────────────────────────────────────────────────
  // Ralph assembles the facts. Fred delivers them.

  getBrief() {
    const threads = window._activeThreads || [];
    const sessions = window._recentSessions || [];
    const lastSession = sessions[0];

    return {
      activeThreadCount: threads.length,
      activeThreadNames: threads.map(t => t['Thread name']).filter(Boolean),
      lastSessionSummary: lastSession ? lastSession.summary : null,
      lastSessionDate: lastSession ? lastSession.created_at : null,
      livingDocLoaded: !!window._livingDocSummary,
      repoMapLoaded: !!window._repoMap && Object.keys(window._repoMap).length > 0,
      davidProfileLoaded: !!window._davidProfile && Object.keys(window._davidProfile).length > 0
    };
  }

};
