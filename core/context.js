// ─── CONTEXT.JS — System prompt assembly ─────────────────────────────────────

const MAX_CONTEXT_CHARS = 24000; // ~6000 tokens at 4 chars/token

function truncate(str, max) {
 if (!str) return '';
 return str.length > max ? str.slice(0, max) + '...' : str;
}

function buildDavidContext() {
 if (!davidProfile) return '';
 return `WHO DAVID IS:
Personality: ${davidProfile.personality || ''}
Work Style: ${davidProfile.work_style || ''}
Values: ${davidProfile.values || ''}
Observed Patterns: ${davidProfile.patterns || ''}
Current Focus: ${davidProfile.current_focus || ''}
Relationship Notes: ${davidProfile.relationship_notes || ''}
${COUNCIL_BLOCK}`.trim();
}

function buildMasterContext(threads, recentSessions = [], repoMap = null) {
 const active = threads.filter(t => t['Status'] === 'Active' && t['thread_type'] !== 'feature');
 const davidCtx = buildDavidContext();

 const sessionCtx = recentSessions.length > 0
   ? '\n\nRECENT SESSION MEMORY:\n' + recentSessions.map(s =>
       `[${new Date(s.created_at).toLocaleDateString()}] ${s.summary}${s.key_decisions ? ' | Decisions: ' + s.key_decisions : ''}`
     ).join('\n')
   : '';

 const repoCtx = repoMap
   ? '\n\nMAVIS CODEBASE:\n' + Object.entries(repoMap).map(([folder, files]) =>
       `${folder}/: ${files.join(', ')}`
     ).join('\n')
   : '';

 const identityCtx = window._livingDocSummary
   ? `\n\n=== MAVIS IDENTITY ===\n${window._livingDocSummary}`
   : '';

 const projectsCtx = active.map(t =>
   `- ${t['Thread name']}: ${t['Goal'] ? t['Goal'].slice(0,120) : 'No goal'} | Next: ${t['Next step'] ? t['Next step'].slice(0,80) : 'Not set'}`
 ).join('\n');

 const full = `${MAVIS_IDENTITY}
${identityCtx}

${davidCtx}${sessionCtx}${repoCtx}

ACTIVE PROJECTS:
${projectsCtx}

${DASHBOARD_INSTRUCTIONS}`;

 return truncate(full, MAX_CONTEXT_CHARS);
}

function buildThreadContext(thread, ideas, otherThreads) {
 const davidCtx = buildDavidContext();

 const crossThreadContext = otherThreads.length > 0
   ? '\n\nOTHER ACTIVE PROJECTS:\n' + otherThreads.map(t =>
       `- ${t['Thread name']}: ${t['Goal'] ? t['Goal'].slice(0,100) : 'No goal'}${t['Next step'] ? ' | Next: ' + t['Next step'].slice(0,80) : ''}`
     ).join('\n')
   : '';

 const ideasContext = ideas.length > 0
   ? '\n\nBANKED IDEAS:\n' + ideas.map(i => '- ' + i.idea_text.slice(0,200)).join('\n')
   : '';

 const recentProgress = thread['Current progress']
   ? '\n\nRECENT HISTORY:\n' + thread['Current progress'].slice(-2000)
   : '';

 const full = `${MAVIS_IDENTITY}

${davidCtx}

CURRENT PROJECT: "${thread['Thread name']}"
Goal: ${thread['Goal']}
Status: ${thread['Status']}
Next Steps: ${thread['Next step']}
Decisions Made: ${thread['Decisions made']}
Open Questions: ${thread['Open question']}
Notes: ${thread['Note']}${recentProgress}${ideasContext}${crossThreadContext}

${THREAD_INSTRUCTIONS}`;

 return truncate(full, MAX_CONTEXT_CHARS);
}
