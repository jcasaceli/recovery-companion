# Deploying the backend

The `server/` is a plain Node/Express app. It must run somewhere public so the
phone (on any network), Stripe webhooks, and the daily rent-reminder cron all
work without your Mac. It's ready to deploy as-is:

- Binds `process.env.PORT` (hosts set this automatically).
- `engines.node >= 20`, `npm start` → `node index.js`.
- Serves `/health` and a Stripe `/return` page.
- Daily reminder cron runs in-process.

## Option A — Render (easiest, deploys from GitHub)
1. Put this repo on GitHub (create a repo, then):
   ```bash
   cd recovery-companion
   git remote add origin https://github.com/<you>/recovery-companion.git
   git push -u origin main
   ```
2. render.com → **New → Web Service** → connect the repo.
   - **Root Directory:** `server`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - Instance type: free or starter.
3. Add the environment variables (below) under **Environment**.
4. Deploy. You'll get a URL like `https://recovery-companion.onrender.com`.

## Option B — Fly.io (deploys from your machine, no GitHub needed)
```bash
brew install flyctl   # or: curl -L https://fly.io/install.sh | sh
cd recovery-companion/server
fly launch         # creates fly.toml; say no to DB; set internal_port 8787
fly secrets set STRIPE_SECRET_KEY=... STRIPE_WEBHOOK_SECRET=... STRIPE_PLATFORM_PRICE_ID=... \
  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... PUBLIC_RETURN_URL=https://<app>.fly.dev/return
fly deploy
```

## Environment variables (set these on the host)
```
STRIPE_SECRET_KEY=sk_test_...        # sk_live_... when going live
STRIPE_WEBHOOK_SECRET=whsec_...      # from the dashboard webhook (below)
STRIPE_PLATFORM_PRICE_ID=price_...
PUBLIC_RETURN_URL=https://YOUR-DEPLOY-URL/return
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...     # service_role (server only!)
ALLOWED_ORIGINS=                     # optional; comma-separated web origins to allow
# ANTHROPIC_API_KEY=sk-ant-...       # optional, for the real assistant
```

## After it's deployed
1. **Register the Stripe webhook** (replaces `stripe listen`):
   Stripe dashboard → **Developers → Webhooks → Add endpoint** →
   URL `https://YOUR-DEPLOY-URL/api/stripe/webhook`, events:
   `account.updated`, `checkout.session.completed`, `invoice.paid`.
   Also enable **"Listen to events on Connected accounts."**
   Copy the endpoint's signing secret → set `STRIPE_WEBHOOK_SECRET` on the host.
2. **Point the app at the deployed server:** in the app `.env`,
   `EXPO_PUBLIC_BACKEND_URL=https://YOUR-DEPLOY-URL`, restart `expo start`.
3. **PUBLIC_RETURN_URL** → `https://YOUR-DEPLOY-URL/return` (so Stripe sends users
   to a real page after Checkout/onboarding).

## Going live (real money)
- Swap all Stripe keys to **live** (`sk_live_…`, live price ID, live webhook secret).
- Operators must re-run **Set up payments** in live mode (test connected accounts
  don't carry over).
- Confirm a real card charge end-to-end before announcing.
- Review `docs/COMPLIANCE.md` (HIPAA / 42 CFR Part 2) before real users.
