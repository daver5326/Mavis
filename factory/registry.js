// ─── REGISTRY.JS — Factory map, department tracking ──────────────────────────

const factoryRegistry = {
  projects: {},

  register(projectId, projectName, departments) {
    this.projects[projectId] = {
      name: projectName,
      departments: departments,
      registeredAt: new Date().toISOString()
    };
    this.persist();
  },

  getDepartments(projectId) {
    return this.projects[projectId]?.departments || [];
  },

  getAllProjects() {
    return Object.entries(this.projects).map(([id, data]) => ({ id, ...data }));
  },

  getDepartmentUsage() {
    const usage = {};
    Object.values(this.projects).forEach(project => {
      (project.departments || []).forEach(dept => {
        usage[dept] = (usage[dept] || 0) + 1;
      });
    });
    return usage;
  },

  persist() {
    try {
      localStorage.setItem('mavis_registry', JSON.stringify(this.projects));
    } catch(e) {}
  },

  load() {
    try {
      const saved = localStorage.getItem('mavis_registry');
      if (saved) this.projects = JSON.parse(saved);
    } catch(e) {}
  }
};

factoryRegistry.load();
