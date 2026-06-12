// ─── api/build-context.js ──────────────────────────────────────────────────
// Server-side endpoint for /build mode (Phase 2).
// Assembles full build context (repo files, recent build sessions, open
// items, Ralph globals) and returns a system prompt + model for chat.js.
//
// Requires factory/buildmode.js (CommonJS — fine here, this runs on Vercel).
// Env vars required: GITHUB_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const { createClient } = require('@supabase/supabase-js');
const buildmode = require('../factory/buildmode');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { filePaths = [], ralphGlobals = {} } = req.body || {};

    const githubToken = process.env.GITHUB_TOKEN;
    if (!githubToken) {
      return res.status(500).json({ error: 'GITHUB_TOKEN not configured' });
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const context = await buildmode.assembleBuildContext({
      filePaths,
      githubToken,
      supabase,
      ralphGlobals
    });

    const systemPrompt = buildmode.buildModeSystemPrompt(context);

    return res.status(200).json({
      systemPrompt,
      model: buildmode.BUILD_MODEL
    });
  } catch (e) {
    console.error('build-context error:', e);
    return res.status(500).json({ error: e.message });
  }
};
