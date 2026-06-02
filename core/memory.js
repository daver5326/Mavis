// ─── MEMORY.JS — All Supabase interactions ───────────────────────────────────

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);
window.db = db;

// ─── DAVID PROFILE ───────────────────────────────────────────────────────────

let davidProfile = null;

async function loadDavidProfile() {
 try {
   const result = await db.from('david').select('*').limit(1).single();
   if (result.data) davidProfile = result.data;
 } catch(e) { davidProfile = null; }
}

async function updateDavidProfile(sessionSummary) {
 if (!davidProfile) return;
 // TODO (medium): gate on session substance
 try {
   const response = await fetch('/api/chat', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({
       system: `You are a background observer. You have David's current profile and a session summary. Determine if the session revealed anything NEW about David. If yes, return a JSON object with only the fields that should change. If no update needed, return {}. Current profile: ${JSON.stringify(davidProfile)} Respond with ONLY valid JSON.`,
       messages: [{ role: 'user', content: `Session summary: ${sessionSummary}` }]
     })
   });
   const data = await response.json();
   if (data.content && data.content[0]) {
     const updates = JSON.parse(data.content[0].text.trim());
     if (Object.keys(updates).length > 0) {
       updates.last_updated = new Date().toISOString();
       await db.from('david').update(updates).eq('id', davidProfile.id);
       Object.assign(davidProfile, updates);
     }
   }
 } catch(e) {}
}

// ─── THREADS ─────────────────────────────────────────────────────────────────

async function fetchAllThreads() {
 const result = await db.from('Threads').select('*');
 return result.data || [];
}

async function fetchThread(id) {
 const result = await db.from('Threads').select('*').eq('id', id).single();
 return result.data || null;
}

async function updateThread(id, updates) {
 return await db.from('Threads').update(updates).eq('id', id);
}

async function insertThread(data) {
 return await db.from('Threads').insert([data]).select().single();
}

async function deleteThreadById(id) {
 return await db.from('Threads').delete().eq('id', id);
}

// ─── IDEAS ────────────────────────────────────────────────────────────────────

async function fetchIdeas(threadId) {
 const result = await db.from('Ideas').select('*').eq('thread_id', threadId);
 return result.data || [];
}

async function insertIdea(threadId, text) {
 return await db.from('Ideas').insert([{ thread_id: threadId, idea_text: text }]);
}

// ─── PROGRESS ────────────────────────────────────────────────────────────────

async function appendProgress(thread, summary, label) {
 const tag = label || 'Session';
 const newProgress = (thread['Current progress'] || '') +
   '\n\n[' + tag + ' ' + new Date().toLocaleDateString() + ']\n' + summary;
 await updateThread(thread.id, {
   'Current progress': newProgress,
   'last_activity_at': new Date().toISOString()
 });
 return newProgress;
}

// ─── SESSIONS ────────────────────────────────────────────────────────────────

async function saveSession(rawLog) {
 // TODO (medium): generate real summary via LLM instead of slice
 try {
   await db.from('sessions').insert([{
     raw_log: rawLog,
     summary: rawLog.slice(0, 500),
     key_decisions: '',
     patterns_observed: '',
     project_tags: []
   }]);
 } catch(e) { console.error('saveSession error:', e); }
}

async function loadRecentSessions(limit = 3) {
 try {
   const result = await db
     .from('sessions')
     .select('created_at, summary, key_decisions, patterns_observed, project_tags')
     .order('created_at', { ascending: false })
     .limit(limit);
   return result.data || [];
 } catch(e) { return []; }
}

// ─── LIVING DOCUMENT ─────────────────────────────────────────────────────────

async function loadLivingDocumentSummary() {
 try {
   const result = await db
     .from('mavis_config')
     .select('value')
     .eq('key', 'living_document_summary')
     .single();
   return result.data?.value || null;
 } catch(e) {
   console.error('loadLivingDocumentSummary error:', e);
   return null;
 }
}

async function loadLivingDocument() {
 try {
   const result = await db
     .from('mavis_config')
     .select('value')
     .eq('key', 'living_document')
     .single();
   return result.data?.value || null;
 } catch(e) {
   console.error('loadLivingDocument error:', e);
   return null;
 }
}
