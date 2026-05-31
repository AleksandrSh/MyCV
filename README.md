# MyCV

Personal CV site for Alex Shabanov, with an optional **AI chat** that answers employer questions based on the public profile on this site.

## AI chat setup

The chat UI runs in the browser. **Google Gemini** runs on a small **Vercel serverless** endpoint so your API key stays server-side.

### 1. Deploy to Vercel

**Recommended flow (one step):**

1. Push this repo to GitHub (if it is not already).
2. Go to [vercel.com/new](https://vercel.com/new) → **Import Git Repository**.
3. Choose **GitHub**, authorize Vercel if asked, then select `AleksandrSh/MyCV`.
4. Leave the defaults (static site + `api/` serverless functions). Click **Deploy**.
5. After the first deploy: **Project → Settings → Environment Variables** and add:
   - `GEMINI_API_KEY` — from [Google AI Studio](https://aistudio.google.com/apikey)
   - `GEMINI_MODEL` (optional) — default `gemini-2.0-flash`
   - `ALLOWED_ORIGINS` — comma-separated origins that may call the API, e.g.  
     `https://aleksandrsh.github.io,https://your-project.vercel.app`
6. **Redeploy** (Deployments → … → Redeploy) so the new env vars apply.

You do **not** need to create an empty project first. **Import from GitHub** creates the Vercel project and links the repo in one go. Every push to `main` can auto-deploy after that.

**Alternative:** Create a project in Vercel, then **Settings → Git → Connect Repository**. Same result, extra step.

The API will be at `https://<your-vercel-domain>/api/chat`.

### 2. Connect the frontend

**If you use Vercel for the whole site** (open the `*.vercel.app` URL): no config needed — chat uses `/api/chat` on the same host.

**If you use GitHub Pages** (`aleksandrsh.github.io/MyCV`): GitHub cannot run `/api/chat`. Edit **`chat-config.js`**:

```javascript
window.MYCV_VERCEL_ORIGIN = 'https://your-project.vercel.app';
```

Push to GitHub so Pages picks up the change.

**ALLOWED_ORIGINS** on Vercel must include `https://aleksandrsh.github.io` (no `/MyCV` path — browsers never send the path in `Origin`).

### Troubleshooting

| Symptom | Fix |
|--------|-----|
| Status: set Vercel URL in chat-config.js | You are on GitHub Pages; set `MYCV_VERCEL_ORIGIN` |
| Failed to fetch / CORS | Add `https://aleksandrsh.github.io` to `ALLOWED_ORIGINS`, redeploy |
| 503 / not configured | Add `GEMINI_API_KEY` on Vercel, **Redeploy** |
| 502 / model error | Try `GEMINI_MODEL=gemini-1.5-flash` in env vars |
| 429 / quota exceeded | Free tier limit hit — enable billing in [Google AI Studio](https://aistudio.google.com/) or wait for reset |
| Nothing visible in chat | Hard-refresh; errors now appear as amber messages in the thread |

Test the API directly (replace with your Vercel URL):

```bash
curl -s https://your-project.vercel.app/api/chat
# should return: {"ok":true,"configured":true,...}

curl -s -X POST https://your-project.vercel.app/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"What does Alex do?"}]}'
```

### 3. Update the persona

Edit `lib/persona.js` when you change experience or projects on the site so the assistant stays accurate.

## Local development

```bash
npx vercel dev
```

Create a local `.env` from `.env.example`. Open the URL Vercel prints (usually `http://localhost:3000`).

## Files

| File | Purpose |
|------|---------|
| `index.html` | CV site + chat widget |
| `chat.js` | Chat UI logic |
| `api/chat.js` | Serverless Gemini proxy |
| `lib/persona.js` | System prompt / profile knowledge |
