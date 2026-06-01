# Backend Plan

The prototype runs fully on-device with mock data. This document describes the
backend, and *why it's shaped the way it is*.

## Status

- ✅ **Assistant proxy — built.** See [`server/`](../server/).
- ✅ **Supabase schema + RLS — written.** [`0001_init.sql`](../supabase/migrations/0001_init.sql) (roles, orgs, individuals, relationships, tasks, notes, reset audit, meetings, push) + [`0002_community_schedule.sql`](../supabase/migrations/0002_community_schedule.sql).
- ✅ **Auth — built.** [`src/state/auth.tsx`](../src/state/auth.tsx) + [`AuthScreen`](../src/screens/AuthScreen.tsx): role pick, email/password, email **or** SMS OTP verification, sign in/out.
- ✅ **Store cutover — built (activates with keys).** [`src/state/store.tsx`](../src/state/store.tsx) runs in **cloud mode** when Supabase is configured and the user is signed in: it bootstraps the individual + check-ins/tasks/notes/posts/schedule from Supabase and routes core writes through [`src/services/db.ts`](../src/services/db.ts). With no keys it's the unchanged on-device prototype.

### Activating the cloud backend

1. Create a Supabase project → SQL editor → run `0001_init.sql` then `0002_community_schedule.sql`.
2. Auth settings: enable email confirmations (built in). For SMS verification, configure an SMS provider (Twilio) — until then the SMS path errors (documented stub).
3. Put `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY` in `.env`, restart `expo start`.
4. The app now requires login. Sign up → verify → you're in, backed by Supabase + RLS.

### Still to wire (next)

- Facilitator "add client" + invite/link supporters (the `createIndividual` / `care_relationships` write paths exist in db.ts; they need UI).
- Real cross-user push fan-out: a Supabase Edge Function `/notify` that reads `push_tokens` for linked profiles and calls Expo's push API (client currently fires a local notification + posts to `BACKEND_URL/api/notify`).
- Cloud sync for messaging threads and milestones/sessions (read paths exist; not yet bootstrapped).
- Stripe billing webhook to populate `organizations.subscription_status`.

## Two responsibilities

1. **Assistant proxy** — holds the Anthropic API key server-side and forwards
   chat requests to Claude. The key must never ship in the app.
2. **Data + auth** — accounts, the loved-one record, check-ins, milestones,
   sessions, and provider messages, with strict per-family isolation.

## Recommended stack: Supabase

[Supabase](https://supabase.com) gives us Postgres + auth + storage + edge
functions, and offers a **BAA on paid plans**, which we need for PHI.

- **Auth** → Supabase Auth (email/OTP or SSO). The app stores only a session
  token locally — never PHI.
- **Database** → Postgres with **Row-Level Security (RLS)** so a caregiver can
  only ever read rows tied to a loved one they're authorized for.
- **Assistant proxy** → a Supabase Edge Function (or a small separate Node
  service) that injects the system prompt and calls Claude.

### Assistant proxy sketch

The client already targets `${backendUrl}/api/assistant` (see
`src/services/assistant.ts`). The server owns the system prompt and the key:

```ts
// Edge function: POST /api/assistant
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }); // server-only

export async function handler(req) {
  const { messages } = await req.json();           // [{role, content}, ...]
  const resp = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: ASSISTANT_SYSTEM_PROMPT,                // source of truth lives here
    messages,
  });
  const text = resp.content.filter(b => b.type === 'text').map(b => b.text).join('');
  return Response.json({ text });
}
```

> Requires a signed **BAA with Anthropic** before any real conversation
> (potential PHI) is sent. Use prompt caching on the system prompt to cut cost.

### RLS sketch

```sql
-- A caregiver is linked to a loved one via a membership table.
create table caregiver_links (
  caregiver_id uuid references auth.users(id),
  loved_one_id uuid references loved_ones(id),
  primary key (caregiver_id, loved_one_id)
);

alter table check_ins enable row level security;

create policy "caregivers read their loved one's check-ins"
  on check_ins for select
  using (exists (
    select 1 from caregiver_links l
    where l.caregiver_id = auth.uid()
      and l.loved_one_id = check_ins.loved_one_id
  ));
```

## Swapping the prototype store for Supabase

`src/state/store.tsx` is intentionally the single integration point. Replace its
internals (AsyncStorage reads/writes) with Supabase queries + realtime
subscriptions; the screen components don't change because they only depend on
the `useAppState()` contract.

## Migration order

1. Stand up Supabase project; enable RLS on every table.
2. Add auth + a minimal onboarding/consent flow.
3. Move tracking data (check-ins, milestones, sessions) behind the API.
4. Move provider messaging behind the API (+ realtime).
5. Add the assistant edge function; set `backendUrl`; sign the Anthropic BAA.
6. Add push notifications.
7. Compliance review (see COMPLIANCE.md) before any real users.
