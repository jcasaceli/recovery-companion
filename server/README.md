# Recovery Companion — Backend Proxy

A tiny Express service that holds the Anthropic API key and forwards chat to
Claude on behalf of the app. The key must never live in the mobile client.

## Run it

```bash
cd server
cp .env.example .env          # then paste your real ANTHROPIC_API_KEY
npm install
npm run dev                   # http://localhost:8787
```

Check it: `curl http://localhost:8787/health` → `{"ok":true,"model":"claude-opus-4-8","hasKey":true}`

## Point the app at it

In the app, set the backend URL (see `src/config.ts`). For a phone running over
the Expo tunnel, `localhost` won't resolve from the device — use your Mac's LAN
IP (e.g. `http://192.168.x.x:8787`) or expose the server via its own tunnel.

## Endpoint

`POST /api/assistant`
```json
{ "messages": [ { "role": "user", "content": "what is an IOP?" } ] }
```
→ `{ "text": "..." }`

The server screens the latest user message for crisis language before calling
the model (defense in depth — the client screens too) and returns crisis
resources directly if matched.

## Model & cost

Defaults to `claude-opus-4-8`. Set `ASSISTANT_MODEL=claude-sonnet-4-6` in `.env`
to cut cost/latency. Uses adaptive thinking at low effort and short `max_tokens`
for snappy, inexpensive chat replies.

## Before production

- Put this behind real authentication; don't expose it open to the internet.
- Restrict CORS to your app's origin.
- Sign a **BAA with Anthropic** before any real (PHI) conversation flows through.
- Log conversations only in a BAA-covered, access-controlled store. See
  `../docs/COMPLIANCE.md`.
