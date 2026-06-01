/**
 * Crisis detection + resources.
 *
 * Safety philosophy: this module is intentionally *over*-sensitive. In a tool
 * for families dealing with substance use and mental health, the cost of
 * showing crisis resources unnecessarily is near zero; the cost of missing a
 * real crisis is catastrophic. So we err heavily toward surfacing help.
 *
 * This is a lightweight keyword screen for the prototype. It is NOT a
 * substitute for clinical risk assessment. In production this should be paired
 * with a model-based classifier and a human escalation pathway.
 */

export interface CrisisResource {
  name: string;
  description: string;
  /** Phone number in dialable form */
  phone?: string;
  /** SMS short code / number */
  sms?: { number: string; body: string };
  url?: string;
}

export const CRISIS_RESOURCES: CrisisResource[] = [
  {
    name: '988 Suicide & Crisis Lifeline',
    description: 'Free, confidential support 24/7. Call or text 988.',
    phone: '988',
    sms: { number: '988', body: 'HELLO' },
    url: 'https://988lifeline.org',
  },
  {
    name: 'Crisis Text Line',
    description: 'Text HOME to 741741 to reach a trained crisis counselor.',
    sms: { number: '741741', body: 'HOME' },
    url: 'https://www.crisistextline.org',
  },
  {
    name: 'SAMHSA National Helpline',
    description:
      'Free, confidential 24/7 treatment referral and information for substance use and mental health. 1-800-662-4357.',
    phone: '1-800-662-4357',
    url: 'https://www.samhsa.gov/find-help/national-helpline',
  },
];

/**
 * Phrases that should immediately trigger crisis resources. Grouped by theme.
 * Lowercased; matched as substrings against lowercased input.
 */
const CRISIS_PATTERNS: string[] = [
  // Self-harm / suicide
  'suicide',
  'suicidal',
  'kill myself',
  'kill themselves',
  'kill himself',
  'kill herself',
  'end my life',
  'end their life',
  'want to die',
  'wants to die',
  'better off dead',
  'hurt myself',
  'hurt themselves',
  'self harm',
  'self-harm',
  'cutting',
  // Overdose / immediate danger
  'overdose',
  'overdosed',
  'od\'d',
  'not breathing',
  'unconscious',
  'unresponsive',
  'turning blue',
  // Acute relapse danger expressed with risk
  'relapsed and',
  // Harm to others
  'hurt someone',
  'kill someone',
];

export interface CrisisScreenResult {
  isCrisis: boolean;
  matched?: string;
}

/**
 * Screen a piece of user text for crisis indicators.
 */
export function screenForCrisis(text: string): CrisisScreenResult {
  const haystack = text.toLowerCase();
  for (const pattern of CRISIS_PATTERNS) {
    if (haystack.includes(pattern)) {
      return { isCrisis: true, matched: pattern };
    }
  }
  return { isCrisis: false };
}

/**
 * The supportive message shown alongside crisis resources. Kept warm, direct,
 * and non-judgmental — and always pointing toward real human help.
 */
export const CRISIS_MESSAGE =
  "It sounds like things may be really hard right now. I'm an AI assistant and " +
  "not equipped to handle an emergency — but people who are trained to help are " +
  "available right now, day or night. If you or your loved one is in immediate " +
  "danger, please call 911. Otherwise, the resources below can help immediately.";

/**
 * If a loved one is in immediate medical danger (e.g. suspected overdose),
 * the priority is emergency services, not a helpline.
 */
export const MEDICAL_EMERGENCY_PATTERNS = [
  'not breathing',
  'unconscious',
  'unresponsive',
  'turning blue',
  'overdose',
  'overdosed',
];

export function isMedicalEmergency(text: string): boolean {
  const haystack = text.toLowerCase();
  return MEDICAL_EMERGENCY_PATTERNS.some((p) => haystack.includes(p));
}
