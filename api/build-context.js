// ─── api/build-context.js ────────────────────────────────────────────────────
// Server-side endpoint for /build mode context assembly.
// Accepts { filePaths, ralphGlobals } and returns { systemPrompt, model }.
// Self-contained — no agent.js dependency.

const { assembleBuildContext, buildModeSystemPrompt, BUILD_MODEL } = require('../factory/buildmode');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { filePaths = [], ralphGlobals = {} } = req.body;

    const githubToken = process.env.GITHUB_TOKEN;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

    if (!githubToken) {
      return res.status(500).json({ error: 'GITHUB_TOKEN not configured' });
    }

    const context = await assembleBuildContext({
      filePaths,
      githubToken,
      supabaseUrl,
      supabaseKey,
      ralphGlobals
    });

    const systemPrompt = buildModeSystemPrompt(context);

    return res.status(200).json({
      success: true,
      systemPrompt,
      model: BUILD_MODEL
    });

  } catch (e) {
    console.error('build-context error:', e);
    return res.status(500).json({ error: e.message });
  }
};
