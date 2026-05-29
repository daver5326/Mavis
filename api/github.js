export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { action, path, content, message, sha } = req.body;

  const REPO = process.env.GITHUB_REPO;
  const TOKEN = process.env.GITHUB_TOKEN;
  const BRANCH = process.env.GITHUB_BRANCH || 'main';
  const BASE = `https://api.github.com/repos/${REPO}`;
  const HEADERS = {
    Authorization: `Bearer ${TOKEN}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };

  try {

    if (action === 'read') {
      const r = await fetch(`${BASE}/contents/${path}`, { headers: HEADERS });
      if (!r.ok) throw new Error(`Read failed: ${r.status}`);
      const data = await r.json();
      const decoded = Buffer.from(data.content, 'base64').toString('utf8');
      return res.status(200).json({ content: decoded, sha: data.sha });
    }

    if (action === 'list') {
      const r = await fetch(`${BASE}/contents/${path || ''}`, { headers: HEADERS });
      if (!r.ok) throw new Error(`List failed: ${r.status}`);
      const data = await r.json();
      return res.status(200).json({
        files: data.map(f => ({
          name: f.name,
          path: f.path,
          type: f.type,
          sha: f.sha
        }))
      });
    }

    if (action === 'write') {
      if (!path || !content || !message) {
        return res.status(400).json({ error: 'path, content, message required' });
      }
      const encoded = Buffer.from(content).toString('base64');
      const body = { message, content: encoded, branch: BRANCH };
      if (sha) body.sha = sha;
      const r = await fetch(`${BASE}/contents/${path}`, {
        method: 'PUT',
        headers: HEADERS,
        body: JSON.stringify(body)
      });
      if (!r.ok) {
        const e = await r.json();
        throw new Error(e.message || 'Write failed');
      }
      const data = await r.json();
      return res.status(200).json({ success: true, sha: data.content.sha });
    }

    if (action === 'commits') {
      const r = await fetch(`${BASE}/commits?sha=${BRANCH}&per_page=5`, { headers: HEADERS });
      if (!r.ok) throw new Error(`Commits failed: ${r.status}`);
      const data = await r.json();
      return res.status(200).json({
        commits: data.map(c => ({
          sha: c.sha,
          message: c.commit.message,
          date: c.commit.author.date
        }))
      });
    }

    return res.status(400).json({ error: 'Unknown action' });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
