const { buildSystemPrompt } = require('../lib/persona');

const MAX_MESSAGES = 24;
const MAX_CONTENT_LENGTH = 4000;
const DEFAULT_MODEL = 'gemini-2.0-flash';
const FALLBACK_MODEL = 'gemini-1.5-flash';

function getAllowedOrigins() {
  const fromEnv = process.env.ALLOWED_ORIGINS;
  if (fromEnv) {
    return fromEnv.split(',').map((o) => o.trim()).filter(Boolean);
  }
  return [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5173',
    'https://aleksandrsh.github.io',
  ];
}

function setCors(req, res) {
  const origin = req.headers.origin;
  const allowed = getAllowedOrigins();
  if (origin && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sanitizeMessages(messages) {
  if (!Array.isArray(messages)) return null;
  const trimmed = messages
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-MAX_MESSAGES)
    .map((m) => ({
      role: m.role,
      content: m.content.trim().slice(0, MAX_CONTENT_LENGTH),
    }))
    .filter((m) => m.content.length > 0);

  while (trimmed.length > 0 && trimmed[0].role === 'assistant') {
    trimmed.shift();
  }

  if (trimmed.length === 0 || trimmed[trimmed.length - 1].role !== 'user') return null;
  return trimmed;
}

function toGeminiContents(messages) {
  return messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
}

async function callGemini(apiKey, model, messages) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: buildSystemPrompt() }],
      },
      contents: toGeminiContents(messages),
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 700,
      },
    }),
  });

  const data = await response.json();
  return { response, data };
}

module.exports = async function handler(req, res) {
  setCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      configured: Boolean(process.env.GEMINI_API_KEY),
      model: process.env.GEMINI_MODEL || DEFAULT_MODEL,
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error: 'Chat is not configured yet. Set GEMINI_API_KEY in Vercel and redeploy.',
    });
  }

  const messages = sanitizeMessages(req.body?.messages);
  if (!messages) {
    return res.status(400).json({ error: 'Invalid messages payload' });
  }

  const primaryModel = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const modelsToTry = primaryModel === FALLBACK_MODEL ? [primaryModel] : [primaryModel, FALLBACK_MODEL];

  try {
    let lastError = null;

    for (const model of modelsToTry) {
      const { response, data } = await callGemini(apiKey, model, messages);

      if (response.ok) {
        const reply = data.candidates?.[0]?.content?.parts
          ?.map((p) => p.text)
          .filter(Boolean)
          .join('')
          .trim();

        if (!reply) {
          return res.status(502).json({ error: 'Empty model response' });
        }

        return res.status(200).json({ reply });
      }

      lastError = data?.error?.message || JSON.stringify(data);
      const quotaExceeded =
        response.status === 429 ||
        data?.error?.status === 'RESOURCE_EXHAUSTED' ||
        /quota|rate limit|resource exhausted/i.test(String(lastError));

      if (quotaExceeded) {
        console.error('Gemini quota exceeded', lastError);
        return res.status(429).json({
          error: 'Assistant temporarily unavailable.',
          detail: lastError,
          code: 'quota_exceeded',
        });
      }

      const retryable = response.status === 404 || /not found|invalid model/i.test(String(lastError));
      if (!retryable) break;
    }

    console.error('Gemini error', lastError);
    return res.status(502).json({
      error: 'Upstream model error',
      detail: lastError,
    });
  } catch (err) {
    console.error('Chat handler error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
