// ─── SUPABASE-ADMIN.JS — Server-side Supabase operations ─────────────────────

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: 'Missing Supabase environment variables' });
  }

  const { action, table, data, filters, query, id } = req.body;

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    'apikey': SUPABASE_SERVICE_KEY,
    'Prefer': 'return=representation'
  };

  const base = `${SUPABASE_URL}/rest/v1`;

  try {

    // ── SELECT ────────────────────────────────────────────────────────────────
    if (action === 'select') {
      if (!table) return res.status(400).json({ error: 'table required' });
      let url = `${base}/${table}?select=*`;
      if (filters) {
        Object.entries(filters).forEach(([k, v]) => {
          url += `&${k}=eq.${encodeURIComponent(v)}`;
        });
      }
      const r = await fetch(url, { headers });
      if (!r.ok) throw new Error(`Select failed: ${r.status}`);
      const d = await r.json();
      return res.status(200).json({ success: true, data: d });
    }

    // ── INSERT ────────────────────────────────────────────────────────────────
    if (action === 'insert') {
      if (!table || !data) return res.status(400).json({ error: 'table and data required' });
      const r = await fetch(`${base}/${table}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(data)
      });
      if (!r.ok) {
        const e = await r.json();
        throw new Error(e.message || `Insert failed: ${r.status}`);
      }
      const d = await r.json();
      return res.status(200).json({ success: true, data: d });
    }

    // ── UPDATE ────────────────────────────────────────────────────────────────
    if (action === 'update') {
      if (!table || !data) return res.status(400).json({ error: 'table and data required' });
      let url = `${base}/${table}`;
      if (id) {
        url += `?id=eq.${id}`;
      } else if (filters) {
        const parts = Object.entries(filters).map(([k, v]) => `${k}=eq.${encodeURIComponent(v)}`);
        url += `?${parts.join('&')}`;
      }
      const r = await fetch(url, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(data)
      });
      if (!r.ok) {
        const e = await r.json();
        throw new Error(e.message || `Update failed: ${r.status}`);
      }
      const d = await r.json();
      return res.status(200).json({ success: true, data: d });
    }

    // ── DELETE ────────────────────────────────────────────────────────────────
    if (action === 'delete') {
      if (!table) return res.status(400).json({ error: 'table required' });
      let url = `${base}/${table}`;
      if (id) {
        url += `?id=eq.${id}`;
      } else if (filters) {
        const parts = Object.entries(filters).map(([k, v]) => `${k}=eq.${encodeURIComponent(v)}`);
        url += `?${parts.join('&')}`;
      }
      const r = await fetch(url, { method: 'DELETE', headers });
      if (!r.ok) {
        const e = await r.json();
        throw new Error(e.message || `Delete failed: ${r.status}`);
      }
      return res.status(200).json({ success: true });
    }

    // ── SQL (via Supabase RPC) ────────────────────────────────────────────────
    if (action === 'sql') {
      if (!query) return res.status(400).json({ error: 'query required' });
      const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ sql: query })
      });
      if (!r.ok) {
        const e = await r.json();
        throw new Error(e.message || `SQL failed: ${r.status}`);
      }
      const d = await r.json();
      return res.status(200).json({ success: true, data: d });
    }

    // ── UPSERT (insert or update by key) ──────────────────────────────────────
    if (action === 'upsert') {
      if (!table || !data) return res.status(400).json({ error: 'table and data required' });
      const upsertHeaders = { ...headers, 'Prefer': 'resolution=merge-duplicates,return=representation' };
      const r = await fetch(`${base}/${table}`, {
        method: 'POST',
        headers: upsertHeaders,
        body: JSON.stringify(data)
      });
      if (!r.ok) {
        const e = await r.json();
        throw new Error(e.message || `Upsert failed: ${r.status}`);
      }
      const d = await r.json();
      return res.status(200).json({ success: true, data: d });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
