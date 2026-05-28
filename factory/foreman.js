// ─── FOREMAN.JS — Pattern observer, shop foreman agent ───────────────────────

const foreman = {

  log: [],

  observe(event) {
    this.log.push({
      event,
      timestamp: new Date().toISOString()
    });
    this.persist();
  },

  getPatterns() {
    const counts = {};
    this.log.forEach(entry => {
      counts[entry.event] = (counts[entry.event] || 0) + 1;
    });
    return counts;
  },

  async surface() {
    const usage = factoryRegistry.getDepartmentUsage();
    const patterns = this.getPatterns();
    const projects = factoryRegistry.getAllProjects();

    if (projects.length < 2) return null;

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: `You are the Mavis Shop Foreman. You observe patterns across all projects and surface insights. Be brief and specific. One insight only. No markdown.`,
          messages: [{
            role: 'user',
            content: `Projects: ${JSON.stringify(projects)}\nDepartment usage: ${JSON.stringify(usage)}\nEvent patterns: ${JSON.stringify(patterns)}\n\nWhat is the single most useful pattern or optimization you notice?`
          }]
        })
      });
      const data = await response.json();
      if (data.content && data.content[0]) return data.content[0].text.trim();
    } catch(e) {}
    return null;
  },

  persist() {
    try {
      localStorage.setItem('mavis_foreman_log', JSON.stringify(this.log.slice(-100)));
    } catch(e) {}
  },

  load() {
    try {
      const saved = localStorage.getItem('mavis_foreman_log');
      if (saved) this.log = JSON.parse(saved);
    } catch(e) {}
  }
};

foreman.load();
