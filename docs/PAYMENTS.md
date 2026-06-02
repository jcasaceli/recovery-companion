# Payments (Stripe)

Two money flows:
- **Rent** — residents → operator, via **Stripe Connect**, charged on the
  operator's connected account so **100% goes to them** (no platform fee).
  One-time and recurring (monthly) supported.
- **Platform** — operator → you, a **$60/mo** subscription.

The Stripe secret key lives only on the backend (`server/`). The app talks to
the backend with the signed-in user's Supabase token. **Use test mode first.**

## 1. Database
Run `supabase/migrations/0010_stripe.sql` in the Supabase SQL editor (adds
`organizations.stripe_account_id`, `charges_enabled`, `individuals.monthly_rent_cents`).

## 2. Stripe dashboard (TEST mode)
1. Toggle **Test mode** (top-right).
2. **Connect** → enable it (Settings → Connect). Choose **Express** accounts.
3. **Products** → create a product "Recovery Companion" with a **recurring
   $60/month** price → copy the **price ID** (`price_...`).
4. **Developers → API keys** → copy the **Secret key** (`sk_test_...`).
5. Webhook (local dev): install the Stripe CLI and run
   `stripe listen --forward-to localhost:8787/api/stripe/webhook` →
   it prints a **webhook signing secret** (`whsec_...`).

## 3. Server env (`server/.env`)
```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PLATFORM_PRICE_ID=price_...
PUBLIC_RETURN_URL=https://example.com/return
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...      # Project Settings → API → service_role (server only!)
```
Then: `cd server && npm run dev` (runs on :8787).

## 4. App env (`.env`)
Point the app at the server (use your Mac's LAN IP, not localhost):
```
EXPO_PUBLIC_BACKEND_URL=http://192.168.x.x:8787
```
Restart `expo start`.

## 5. Test the flow
- **Operator:** Account tab → **Set up payments** → complete Stripe Express
  onboarding (use Stripe's test data) → status shows "Connected."
- **Resident:** Home → **Pay rent** → enter an amount → Pay once / monthly →
  Stripe Checkout opens. Use test card `4242 4242 4242 4242`, any future expiry/CVC.
- **Platform sub:** Account tab → **Subscribe — $60/mo** → Checkout (test card).

## Endpoints (server)
| Method | Path | Who | Purpose |
|---|---|---|---|
| POST | `/api/stripe/connect/onboard` | facilitator | Start Connect onboarding |
| GET  | `/api/stripe/connect/status` | facilitator | Charges/payouts enabled? |
| POST | `/api/stripe/rent/checkout` | resident | One-time or recurring rent |
| POST | `/api/stripe/platform/subscribe` | facilitator | $60/mo subscription |
| POST | `/api/stripe/webhook` | Stripe | account.updated, checkout.session.completed |

## Before real money
- Switch to **live** keys + re-onboard operators in live mode.
- Host a real **return page** (PUBLIC_RETURN_URL) or deep link back into the app.
- Decide subscription enforcement (gate access when `subscription_status` lapses).
- Review tax handling and your Stripe + platform terms.
