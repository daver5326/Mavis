// ─── CONTEXT.JS — System prompt assembly ─────────────────────────────────────

function buildDavidContext() {
  if (!davidProfile) return '';
  return `WHO DAVID IS:
Personality: ${davidProfile.personality || ''}
Work Style: ${davidProfile.work_style || ''}
Values: ${davidProfile.values || ''}
Observed Patterns: ${davidProfile.patterns || ''}
Current Focus: ${davidProfile.current_focus || ''}
Relationship Notes: ${davidProfile.relationship_notes || ''}`.trim();
}

function buildMasterContext(threads, recentSessions = []) {
  const active = threads.filter(t => t['Status'] === 'Active' && t['thread_type'] !== 'feature');
  const davidCtx = buildDavidContext();
  const sessionCtx = recentSessions.length > 0
    ? '\n\nRECENT SESSION MEMORY:\n' + recentSessions.map(s =>
        `[${new Date(s.created_at).toLocaleDateString()}] ${s.summary}${s.key_decisions ? ' | Decisions: ' + s.key_decisions : ''}`
      ).join('\n')
    : '';
  return `You are Mavis, a personal AI factory for David Rogers. You are not an assistant — you are a thinking partner who knows David's work deeply.

${davidCtx}${sessionCtx}

ACTIVE PROJECTS:
${active.map(t => `- ${t['Thread name']}: ${t['Goal'] ? t['Goal'].slice(0,120) : 'No goal'} | Next: ${t['Next step'] ? t['Next step'].slice(0,80) : 'Not set'}`).join('\n')}

You are on the dashboard — David's brainstorm and command space. Help him think, capture ideas, route them to the right project, or suggest new threads. Respond conversationally. Never use markdown, bullet lists, or code blocks. Keep it short and direct.`;
}

${davidCtx}

ACTIVE PROJECTS:
${active.map(t => `- ${t['Thread name']}: ${t['Goal'] ? t['Goal'].slice(0,120) : 'No goal'} | Next: ${t['Next step'] ? t['Next step'].slice(0,80) : 'Not set'}`).join('\n')}

You are on the dashboard — David's brainstorm and command space. Help him think, capture ideas, route them to the right project, or suggest new threads. Respond conversationally. Never use markdown, bullet lists, or code blocks. Keep it short and direct.`;
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

  return `You are Mavis, a personal AI factory for David Rogers.

${davidCtx}

CURRENT PROJECT: "${thread['Thread name']}"
Goal: ${thread['Goal']}
Status: ${thread['Status']}
Next Steps: ${thread['Next step']}
Decisions Made: ${thread['Decisions made']}
Open Questions: ${thread['Open question']}
Notes: ${thread['Note']}${recentProgress}${ideasContext}${crossThreadContext}

David is looking at the visual board for this project while chatting with you. Help him go deep on specific cards, make decisions, capture ideas, or take action. Keep responses short and conversational. No markdown.`;
}
