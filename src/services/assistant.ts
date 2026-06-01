/**
 * The "Companion" assistant — a warm, supportive AI helper for parents.
 *
 * ── Design principles ────────────────────────────────────────────────────
 * 1. WARM, NOT FAKE-HUMAN. The assistant is empathetic and conversational, but
 *    it is honest that it's an AI. It opens with a brief disclosure and never
 *    claims to be a person or a clinician. (This is both an ethics choice and
 *    a legal one — AI-disclosure laws increasingly require it.)
 * 2. SAFETY FIRST. Every user turn is screened for crisis indicators *before*
 *    it ever reaches the model, so help can be surfaced instantly.
 * 3. STAY IN LANE. It offers emotional support and general, educational
 *    information — never diagnosis, dosing, or clinical instructions. For
 *    anything clinical it points the parent to their loved one's provider.
 *
 * ── Architecture / compliance ────────────────────────────────────────────
 * The Anthropic API key MUST NOT live in the mobile app — a shipped app can be
 * decompiled and the key extracted. Worse, in production the conversation may
 * contain PHI, which can only go to Anthropic under a signed BAA. So the real
 * call goes to OUR backend (`/api/assistant`), which holds the key server-side
 * and is covered by the BAA. See `docs/BACKEND.md` (to be created).
 *
 * For the prototype with no backend configured, we fall back to a local canned
 * response so the UI is fully demoable offline. The fallback is clearly marked.
 */

import { ChatMessage } from '../types';
import { BACKEND_URL } from '../config';
import {
  screenForCrisis,
  isMedicalEmergency,
  CRISIS_MESSAGE,
} from './crisis';

/**
 * System prompt that defines the assistant's persona and guardrails. This is
 * sent by the BACKEND, not the client — duplicated here only as the source of
 * truth / documentation. (Keep client and server copies in sync, or better,
 * have the server own it exclusively.)
 */
export const ASSISTANT_SYSTEM_PROMPT = `You are "Companion," a supportive assistant inside an app used by parents and family members whose loved one is in treatment for substance use disorder and/or mental health conditions.

WHO YOU ARE
- You are an AI assistant, not a human and not a clinician. If asked, say so plainly and kindly. Do not pretend to be a person, therapist, doctor, or counselor.
- Your tone is warm, calm, patient, and non-judgmental. These families carry a lot. Validate feelings before offering information.

WHAT YOU DO
- Offer emotional support and a listening presence.
- Explain treatment concepts in plain language (e.g. what an IOP is, what medication-assisted treatment means, what to expect after detox).
- Share general, evidence-informed coping strategies for caregivers (boundaries, self-care, communication, support groups like Al-Anon/Nar-Anon).
- Help parents prepare questions to ask their loved one's care team.

WHAT YOU DO NOT DO
- Do NOT diagnose, give medical advice, recommend or adjust medications/doses, or give clinical instructions. Redirect these to the loved one's provider — the app has a "Message provider" feature; suggest using it.
- Do NOT make predictions about whether someone will relapse or recover.
- Do NOT shame, lecture, or use stigmatizing language ("addict", "clean/dirty"). Use person-first language ("person with a substance use disorder", "return to use" instead of "relapse" when natural).

SAFETY
- If the parent describes any risk of suicide, self-harm, overdose, or danger to anyone, your FIRST priority is directing them to immediate help (988, or 911 for a medical emergency). The app surfaces crisis resources automatically, but you should also gently encourage reaching out to those.

STYLE
- Keep replies fairly short and human. Ask a gentle follow-up question when appropriate. Avoid bullet-point info-dumps unless asked.`;

/**
 * A short disclosure shown as the assistant's first message in any new chat.
 */
export const ASSISTANT_GREETING =
  "Hi, I'm Companion — an AI assistant here to support you. I'm not a doctor or " +
  "counselor, but I can listen, help you understand what your loved one is going " +
  "through, and help you think things through. What's on your mind today?";

export interface AssistantConfig {
  /** Base URL of our backend. When unset, the local mock is used. */
  backendUrl?: string;
}

export interface AssistantReply {
  text: string;
  crisisFlagged: boolean;
  /** True when this came from the offline mock rather than the real model */
  isMock: boolean;
}

/**
 * Send the conversation to the assistant and get a reply.
 *
 * @param history  Prior messages (excluding the new user message).
 * @param userText The new user message text.
 */
export async function sendToAssistant(
  history: ChatMessage[],
  userText: string,
  config: AssistantConfig = { backendUrl: BACKEND_URL },
): Promise<AssistantReply> {
  // 1) Safety screen BEFORE anything else.
  const crisis = screenForCrisis(userText);
  if (crisis.isCrisis) {
    const lead = isMedicalEmergency(userText)
      ? 'If your loved one may be in immediate medical danger, please call 911 right now. '
      : '';
    return {
      text: lead + CRISIS_MESSAGE,
      crisisFlagged: true,
      isMock: false,
    };
  }

  // 2) Real backend call (production path).
  if (config.backendUrl) {
    try {
      const res = await fetch(`${config.backendUrl}/api/assistant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            ...history.map((m) => ({ role: m.role, content: m.text })),
            { role: 'user', content: userText },
          ],
        }),
      });
      if (!res.ok) throw new Error(`Backend responded ${res.status}`);
      const data = (await res.json()) as { text: string };
      return { text: data.text, crisisFlagged: false, isMock: false };
    } catch (err) {
      // Fall through to mock so the UI never hard-fails in front of a parent.
      console.warn('[assistant] backend call failed, using mock:', err);
    }
  }

  // 3) Offline mock fallback (prototype only).
  return { text: mockReply(userText), crisisFlagged: false, isMock: true };
}

/**
 * A very small canned-response generator so the chat is demoable without a
 * backend. Intentionally generic and clearly supportive. NOT the real model.
 */
function mockReply(userText: string): string {
  const t = userText.toLowerCase();
  if (t.includes('relapse') || t.includes('return to use')) {
    return (
      "A return to use can feel really frightening, and it doesn't erase the " +
      "progress your loved one has made — recovery often isn't a straight line. " +
      "It can help to share what you're noticing with their care team. Would it " +
      "help to think through how to bring it up with them?"
    );
  }
  if (t.includes('iop') || t.includes('outpatient') || t.includes('php')) {
    return (
      "Great question. An IOP (Intensive Outpatient Program) is a structured " +
      "level of care where someone attends therapy several times a week but " +
      "lives at home — a step down from inpatient. Want me to walk through what a " +
      "typical week looks like?"
    );
  }
  if (t.includes('scared') || t.includes('worried') || t.includes('anxious')) {
    return (
      "That worry makes complete sense — you love them, and the uncertainty is " +
      "hard to sit with. You don't have to carry it alone. What feels heaviest " +
      "for you right now?"
    );
  }
  return (
    "Thank you for sharing that with me. I'm here to listen and help however I " +
    "can. Can you tell me a little more about what's going on? (Note: I'm an AI " +
    "assistant — for anything clinical, your loved one's care team is the best " +
    "source, and you can reach them on the Messages tab.)"
  );
}
