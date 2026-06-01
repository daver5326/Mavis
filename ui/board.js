// ─── BOARD.JS — Thread board rendering and insight cards ─────────────────────

function buildBoardFromThread(thread, ideas) {
 const cards = [];

 if (thread['Goal']) {
   cards.push({
     zone: 'Goal',
     color: 'green',
     title: 'Goal',
     body: thread['Goal'],
     why: 'The north star for this project.',
     next: thread['Next step'] || 'Not set'
   });
 }

 if (thread['Next step']) {
   cards.push({
     zone: 'Next',
     color: 'blue',
     title: 'Next Step',
     body: thread['Next step'],
     why: 'The immediate action to move this forward.',
     next: null
   });
 }

 if (thread['Decisions made']) {
   cards.push({
     zone: 'Decisions',
     color: 'amber',
     title: 'Decisions Made',
     body: thread['Decisions made'],
     why: 'Locked in. No need to revisit.',
     next: null
   });
 }

 if (thread['Open question']) {
   cards.push({
     zone: 'Questions',
     color: 'red',
     title: 'Open Questions',
     body: thread['Open question'],
     why: 'Unresolved. Needs an answer before moving forward.',
     next: null
   });
 }

 if (thread['Note']) {
   cards.push({
     zone: 'Notes',
     color: 'amber',
     title: 'Notes',
     body: thread['Note'],
     why: 'Context and reference.',
     next: null
   });
 }

 if (ideas && ideas.length > 0) {
   cards.push({
     zone: 'Ideas',
     color: 'blue',
     title: 'Banked Ideas',
     body: ideas.map(i => '· ' + i.idea_text.slice(0, 120)).join('\n'),
     why: 'Captured for later — not lost.',
     next: null
   });
 }

 if (thread['Current progress']) {
   const recent = thread['Current progress'].slice(-600);
   cards.push({
     zone: 'Progress',
     color: 'green',
     title: 'Recent Progress',
     body: recent,
     why: 'What has happened so far.',
     next: null
   });
 }

 return cards;
}

function renderBoard(cards) {
 const container = document.getElementById('board-content');
 if (!container) return;

 if (!cards || cards.length === 0) {
   container.innerHTML = '<p class="loading" style="margin-top:16px;">No board data yet.</p>';
   return;
 }

 const insightPlaceholder = `<div id="insight-card" class="insight" style="display:none;">
   <div class="insight-icon">✦</div>
   <div>
     <div class="insight-label">Mavis Insight</div>
     <div id="insight-text" class="insight-text"></div>
   </div>
 </div>`;

 const cardHTML = cards.map((card, i) => `
   <div class="card ${card.color}" onclick="openCardDetail(${i})">
     <div class="card-title">${card.title}</div>
     <div class="card-body">${card.body ? card.body.slice(0, 140) : ''}</div>
     <span class="card-arrow">›</span>
   </div>`).join('');

 container.innerHTML = insightPlaceholder + cardHTML;
 window._boardCards = cards;
}

function openCardDetail(index) {
 const card = window._boardCards && window._boardCards[index];
 if (!card) return;

 document.getElementById('ov-zone').textContent = card.zone;
 document.getElementById('ov-title').textContent = card.title;
 document.getElementById('ov-body').textContent = card.body || '';
 document.getElementById('ov-why').textContent = card.why || '';
 document.getElementById('ov-next').textContent = card.next || '—';

 document.getElementById('card-overlay').style.display = 'flex';
}

function closeCardDetail() {
 document.getElementById('card-overlay').style.display = 'none';
}

async function generateInsightCard(thread, ideas) {
 try {
   const prompt = `You are Mavis. Given this project, generate one sharp insight or observation David should know right now. One sentence. No preamble. No markdown.

Project: ${thread['Thread name']}
Goal: ${thread['Goal'] || 'not set'}
Next Step: ${thread['Next step'] || 'not set'}
Open Questions: ${thread['Open question'] || 'none'}
Ideas: ${ideas && ideas.length > 0 ? ideas.map(i => i.idea_text).join(', ') : 'none'}`;

   const response = await fetch('/api/chat', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({
       system: MAVIS_IDENTITY,
       messages: [{ role: 'user', content: prompt }]
     })
   });
   const data = await response.json();
   if (data.content && data.content[0]) return data.content[0].text.trim();
   return null;
 } catch(e) { return null; }
}

function injectInsight(text) {
 const card = document.getElementById('insight-card');
 const textEl = document.getElementById('insight-text');
 if (!card || !textEl) return;
 textEl.textContent = text;
 card.style.display = 'flex';
}
