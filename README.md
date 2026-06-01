# Recovery Companion

A mobile app (iOS + Android, via Expo / React Native) that helps parents and
family members **track a loved one's progress** through substance use disorder
and mental health treatment, **ask questions** of a warm, AI-powered assistant,
and **message their loved one's care team** directly.

> ⚠️ **Prototype.** This codebase uses mock/test data only. It is **not yet
> safe for real patient information.** See [docs/COMPLIANCE.md](docs/COMPLIANCE.md)
> before going anywhere near real users or PHI.

## What's in the app

| Tab | What it does |
|-----|--------------|
| **Home** | At-a-glance summary: days in recovery, latest check-in, next milestone, recent activity. |
| **Progress** | Daily mood check-ins + a merged timeline of check-ins, milestones, and treatment sessions. |
| **Assistant** | "Companion" — a warm but **honestly disclosed** AI helper. Screens every message for crisis indicators and surfaces help instantly. |
| **Messages** | Direct, async messaging with the loved one's care team (counselor, case manager, etc.). |
| **Resources** | Always-available crisis lines (988, SAMHSA, Crisis Text Line) plus family-support and education links. |

## Design decisions worth knowing

- **The assistant is warm, not fake-human.** It opens with a brief "I'm an AI
  assistant" disclosure and never claims to be a clinician. This is both an
  ethics choice and a legal one (AI-disclosure laws). See
  [src/services/assistant.ts](src/services/assistant.ts).
- **Safety is wired in before the model.** Every user message is screened for
  crisis language *first* ([src/services/crisis.ts](src/services/crisis.ts));
  if anything matches, crisis resources are shown immediately and the message
  never depends on the model to "notice."
- **The API key never lives in the app.** The assistant calls *our* backend,
  which holds the Anthropic key and is covered by a BAA. See
  [docs/BACKEND.md](docs/BACKEND.md).

## Running it

You need Node.js (already installed) and the **Expo Go** app on your phone
(App Store / Play Store), or an iOS Simulator / Android Emulator.

```bash
cd recovery-companion
npx expo start
```

Then scan the QR code with Expo Go (Android) or the Camera app (iOS). Press
`i` for the iOS simulator or `a` for the Android emulator if you have them.

## Project structure

```
src/
├── theme/            # colors, spacing, typography
├── types/            # data models
├── data/             # mock data (NO real PHI)
├── state/            # AsyncStorage-backed app store (prototype)
├── services/
│   ├── crisis.ts     # crisis screening + resources
│   └── assistant.ts  # Claude assistant wrapper (+ offline mock)
├── components/       # reusable UI
├── navigation/       # bottom-tab navigator
└── screens/          # Home, Progress, Assistant, Messages, Resources
```

## Roadmap

- [x] Onboarding + consent flow (welcome → profile setup → AI/crisis disclosure)
- [x] Assistant proxy server (`server/`) — real Claude via `claude-opus-4-8`, key server-side
- [x] Supabase schema + RLS migration + dormant client (`supabase/`, `src/services/supabase.ts`)
- [ ] Swap the local store internals over to Supabase (screens unchanged) — see [docs/BACKEND.md](docs/BACKEND.md)
- [ ] Real auth (Supabase Auth) wired into onboarding
- [ ] Push notifications (provider replies, check-in reminders)
- [ ] Multi-caregiver support (both parents share one loved one's data)
- [ ] HIPAA / 42 CFR Part 2 readiness + BAAs — see [docs/COMPLIANCE.md](docs/COMPLIANCE.md)

## Configuration

Copy [`.env.example`](.env.example) → `.env` to point the app at the backend
(`EXPO_PUBLIC_BACKEND_URL`) and/or Supabase. Without these, the app runs fully
offline with the built-in mock assistant and local store.
