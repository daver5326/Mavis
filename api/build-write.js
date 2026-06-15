// ─── api/build-write.js ───────────────────────────────────────────────────────
// Server-side endpoint for /build mode file commits (Phase 2D).
// Accepts { path, content, commitMessage } and writes directly to GitHub.
// Self-contained — no agent.js dependency.

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { path, content, commitMessage } = req.body;
    if (!path || !content) {
      return res.status(400).json({ error: 'path and content are required' });
    }

    const githubToken = process.env.GITHUB_TOKEN;
    const repo = process.env.GITHUB_REPO || 'daver5326/Mavis';
    const branch = process.env.GITHUB_BRANCH || 'main';

    if (!githubToken) {
      return res.status(500).json({ error: 'GITHUB_TOKEN not configured' });
    }

    // Fetch current SHA — required by GitHub API to update existing files
    const getUrl = `https://api.github.com/repos/${repo}/contents/${path}?ref=${branch}`;
    const getRes = await fetch(getUrl, {
      headers: {
        Authorization: `token ${githubToken}`,
        Accept: 'application/vnd.github.v3+json'
      }
    });

    let sha = null;
    if (getRes.ok) {
      const getData = await getRes.json();
      sha = getData.sha;
    }

    // Commit the file
    const putUrl = `https://api.github.com/repos/${repo}/contents/${path}`;
    const putRes = await fetch(putUrl, {
      method: 'PUT',
      headers: {
        Authorization: `token ${githubToken}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: commitMessage || `Mavis /build: update ${path}`,
        content: Buffer.from(content).toString('base64'),
        sha,
        branch
      })
    });

    const putData = await putRes.json();
    if (!putRes.ok) {
      return res.status(500).json({ error: putData.message || 'GitHub write failed' });
    }

    return res.status(200).json({
      success: true,
      path,
      sha: putData.content?.sha,
      commit: putData.commit?.sha
    });

  } catch (e) {
    console.error('build-write error:', e);
    return res.status(500).json({ error: e.message });
  }
};
