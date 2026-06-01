# Compliance & Safety Notes

This app handles some of the most sensitive data that exists in US healthcare.
Read this before connecting any real data or real users.

## Why this is extra-regulated

1. **HIPAA** applies to protected health information (PHI) once you operate as
   (or on behalf of) a covered entity / its business associate.
2. **42 CFR Part 2** is a *separate, stricter* federal rule that governs the
   confidentiality of **substance use disorder (SUD) treatment records** held by
   federally-assisted programs. It restricts re-disclosure more tightly than
   HIPAA and generally requires specific patient consent for each disclosure.
3. **Minors.** If the loved one is a minor, state law adds consent/guardianship
   rules — and these vary significantly by state.
4. **The "loved one," not the app user, is usually the patient.** A parent using
   the app to view their adult child's treatment data needs the *patient's*
   consent for that disclosure. Build consent into the data model, not as an
   afterthought.

> None of the above is legal advice. Engage a healthcare-privacy attorney before
> launch.

## What the prototype does to stay safe

- **Mock data only.** Everything in `src/data/mockData.ts` is fictional.
- **No PHI leaves the device.** The offline assistant mock means you can demo the
  full UI with zero network calls.
- **No analytics/crash SDKs** are wired in. Don't add any that could capture PHI
  (screen recordings, breadcrumbs containing message text, etc.).

## Checklist before real users / real data

- [ ] Sign a **BAA** with every vendor that touches PHI — Anthropic (for the
      assistant), your backend host, your database, push-notification provider,
      error monitoring, etc. **No BAA → no PHI may flow to that vendor.**
- [ ] **Encryption** in transit (TLS) and at rest (DB-level + field-level for the
      most sensitive fields).
- [ ] **Authentication** with strong session management; treat the device as
      untrusted (store only a token locally, never PHI).
- [ ] **Consent flows**: explicit, revocable, per-disclosure consent recorded
      with timestamp — designed around 42 CFR Part 2.
- [ ] **Audit logging** of all PHI access.
- [ ] **Access controls / least privilege** (row-level security — see BACKEND.md).
- [ ] **Crisis pathway reviewed by a clinician.** The keyword screen in
      `src/services/crisis.ts` is a prototype safety net, not a clinical tool.
- [ ] **Data retention & deletion** policy, including right-to-delete.
- [ ] **Breach response** plan.

## The assistant, specifically

- Keep the system prompt's guardrails (no diagnosis/dosing, redirect clinical
  questions to providers, crisis-first) under version control and clinician
  review.
- Log assistant conversations only in a BAA-covered, access-controlled store.
- Consider a model-based safety classifier in addition to the keyword screen.
