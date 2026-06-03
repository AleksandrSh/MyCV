# MyCV

Personal CV site for Alex Shabanov, hosted on **Vercel**, with an **AI chat** that answers employer questions from the public profile on this site.

## Deploy (Vercel)

1. Import [AleksandrSh/MyCV](https://github.com/AleksandrSh/MyCV) at [vercel.com/new](https://vercel.com/new).
2. Deploy with defaults (static `index.html` + `api/` serverless functions).
3. **Project → Settings → Environment Variables:**
   - `GEMINI_API_KEY` — from [Google AI Studio](https://aistudio.google.com/apikey)
   - `GEMINI_MODEL` (optional) — default `gemini-2.0-flash-lite`. If chat fails with quota errors, set this to the **same model** your other working site uses.
   - Use the **same `GEMINI_API_KEY`** as the site where Gemini already works (Vercel → env vars → paste key → **Redeploy**).
   - `ALLOWED_ORIGINS` (optional) — only if you use a **custom domain**; add that origin (e.g. `https://yourdomain.com`). Same-origin Vercel URLs do not need this.
4. **Redeploy** after changing env vars.

Pushes to `main` auto-deploy when the repo is connected.

### Turn off GitHub Pages (optional)

If this repo still publishes to GitHub Pages: **GitHub repo → Settings → Pages → Source → None**. Use your Vercel URL (or custom domain) as the public link.

## AI chat

Chat UI in the browser; **Google Gemini** runs in `api/chat.js` so the API key stays server-side.

Edit `lib/persona.js` when you update experience or projects on the site.

### Troubleshooting

| Symptom | Fix |
|--------|-----|
| 503 / not configured | Set `GEMINI_API_KEY` on Vercel, **Redeploy** |
| 502 / model error | Try `GEMINI_MODEL=gemini-1.5-flash` |
| 429 / temporary unavailable | Quota on this key/model — copy the working key from your other site, or set `GEMINI_MODEL` to match it, then redeploy |
| API test | `curl -s https://your-project.vercel.app/api/chat` → `"configured":true` |

## Local development

```bash
npx vercel dev
```

Copy `.env.example` to `.env` with your `GEMINI_API_KEY`.

## Files

| File | Purpose |
|------|---------|
| `index.html` | CV site + chat widget |
| `chat.js` | Chat UI logic |
| `api/chat.js` | Serverless Gemini proxy |
| `lib/persona.js` | System prompt / profile knowledge |
