const { buildSystemPrompt } = require('../lib/persona');

const MAX_MESSAGES = 24;
const MAX_CONTENT_LENGTH = 4000;
const DEFAULT_MODEL = 'gemini-2.5-flash';
const FALLBACK_MODELS = ['gemini-2.0-flash', 'gemini-2.0-flash-lite'];

function getApiKey() {
  const raw = process.env.GEMINI_API_KEY || '';
  return raw.trim().replace(/^["']|["']$/g, '');
}

function getModelList() {
  const primary = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  return [primary, ...FALLBACK_MODELS.filter((m) => m !== primary)];
}

function getAllowedOrigins() {
  const fromEnv = process.env.ALLOWED_ORIGINS;
  if (fromEnv) {
    return fromEnv.split(',').map((o) => o.trim()).filter(Boolean);
  }
  return ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:5173'];
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

function classifyGeminiFailure(response, data) {
  const message = data?.error?.message || JSON.stringify(data);
  const quotaExceeded =
    response.status === 429 ||
    data?.error?.status === 'RESOURCE_EXHAUSTED' ||
    /quota|rate limit|resource exhausted|billing details/i.test(String(message));
  const modelNotFound =
    response.status === 404 || /not found|not supported for generateContent/i.test(String(message));

  return { message, quotaExceeded, modelNotFound };
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
      configured: Boolean(getApiKey()),
      model: process.env.GEMINI_MODEL || DEFAULT_MODEL,
      fallbacks: FALLBACK_MODELS,
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    return res.status(503).json({
      error: 'Chat is not configured yet. Set GEMINI_API_KEY in Vercel and redeploy.',
    });
  }

  const messages = sanitizeMessages(req.body?.messages);
  if (!messages) {
    return res.status(400).json({ error: 'Invalid messages payload' });
  }

  const modelsToTry = getModelList();
  const failures = [];

  try {
    for (const model of modelsToTry) {
      const { response, data } = await callGemini(apiKey, model, messages);

      if (response.ok) {
        const reply = data.candidates?.[0]?.content?.parts
          ?.map((p) => p.text)
          .filter(Boolean)
          .join('')
          .trim();

        if (!reply) {
          failures.push({ model, type: 'empty', message: 'Empty model response' });
          continue;
        }

        return res.status(200).json({ reply, model });
      }

      const failure = classifyGeminiFailure(response, data);
      failures.push({ model, ...failure });
      console.error(`Gemini error for model ${model}`, failure.message);

      if (!failure.quotaExceeded && !failure.modelNotFound) {
        break;
      }
    }

    const quotaFailures = failures.filter((f) => f.quotaExceeded);
    const modelFailures = failures.filter((f) => f.modelNotFound);

    if (quotaFailures.length > 0) {
      const detail = quotaFailures.map((f) => `${f.model}: ${f.message}`).join(' | ');
      return res.status(429).json({
        error: 'Assistant temporarily unavailable.',
        detail,
        code: 'quota_exceeded',
        modelsTried: modelsToTry,
      });
    }

    if (modelFailures.length === failures.length && failures.length > 0) {
      return res.status(502).json({
        error: 'Upstream model error',
        detail: modelFailures.map((f) => `${f.model}: ${f.message}`).join(' | '),
        code: 'model_not_found',
        modelsTried: modelsToTry,
      });
    }

    const last = failures[failures.length - 1];
    return res.status(502).json({
      error: 'Upstream model error',
      detail: last ? `${last.model}: ${last.message}` : 'Unknown error',
      modelsTried: modelsToTry,
    });
  } catch (err) {
    console.error('Chat handler error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
