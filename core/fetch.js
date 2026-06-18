// core/fetch.js
// Shared file reading utility for Callum, Ralph, and /build.
// Single responsibility: fetch a file from GitHub reliably.
// Features: 3 retries, exponential backoff, 10s timeout, explicit errors.

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO;
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';

async function fetchWithTimeout(url, options, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeout);
    return res;
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
}

async function fetchFileFromGitHub(filePath, retries = 3) {
  const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${filePath}?ref=${GITHUB_BRANCH}`;
  const options = {
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github.v3+json'
    }
  };

  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetchWithTimeout(url, options);
      if (!res.ok) {
        throw new Error(`GitHub returned ${res.status} for ${filePath}`);
      }
      const data = await res.json();
      const content = Buffer.from(
        data.content.replace(/\n/g, ''), 'base64'
      ).toString('utf-8');
      return { path: filePath, content, sha: data.sha };
    } catch (e) {
      lastError = e;
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, attempt * 1000));
      }
    }
  }
  return { path: filePath, error: `Failed after ${retries} attempts: ${lastError.message}` };
}

module.exports = { fetchFileFromGitHub };
