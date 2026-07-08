/**
 * Core data models for Sober Living Companion.
 *
 * IMPORTANT (compliance): In production, much of this data is protected under
 * HIPAA and 42 CFR Part 2 (federal confidentiality rules for substance use
 * disorder records). During the prototype phase these types only ever hold
 * mock / test data — never real patient information.
 */

export type Relationship =
  | 'son'
  | 'daughter'
  | 'child'
  | 'spouse'
  | 'sibling'
  | 'parent'
  | 'other';

export type ProgramType =
  | 'detox'
  | 'inpatient'
  | 'residential'
  | 'php' // Partial Hospitalization Program
  | 'iop' // Intensive Outpatient Program
  | 'outpatient'
  | 'sober-living'
  | 'aftercare';

export interface Provider {
  id: string;
  name: string;
  role: string; // e.g. "Primary Counselor", "Psychiatrist", "Case Manager"
  organization: string;
}

export interface LovedOne {
  id: string;
  firstName: string;
  relationship: Relationship;
  programName: string;
  programType: ProgramType;
  /** ISO date string */
  treatmentStartDate: string;
  /** ISO date string of recovery start, if applicable */
  sobrietyDate?: string;
  careTeam: Provider[];
  /** Rent (cloud) — shown to the member on Home/Pay rent. */
  monthlyRentCents?: number;
  rentDueDay?: number;
}

/** 1 = really struggling … 5 = thriving */
export type MoodLevel = 1 | 2 | 3 | 4 | 5;

export interface CheckIn {
  id: string;
  /** ISO date string */
  date: string;
  mood: MoodLevel;
  note?: string;
  /** Free-form tags, e.g. "anxious", "hopeful", "family visit" */
  tags: string[];
}

export type MilestoneCategory = 'recovery' | 'treatment' | 'personal' | 'health';

export interface Milestone {
  id: string;
  /** ISO date string */
  date: string;
  title: string;
  description?: string;
  category: MilestoneCategory;
  /** Whether the family has "celebrated" / acknowledged it */
  celebrated: boolean;
}

export type SessionType =
  | 'individual-therapy'
  | 'group-therapy'
  | 'family-therapy'
  | 'psychiatry'
  | 'medical'
  | 'support-group';

export interface TreatmentSession {
  id: string;
  /** ISO date string */
  date: string;
  type: SessionType;
  providerId?: string;
  attended: boolean;
  note?: string;
}

/**
 * A single entry in the unified progress timeline. The timeline merges
 * check-ins, milestones, and sessions into one chronological feed.
 */
export type TimelineKind = 'check-in' | 'milestone' | 'session';

export interface TimelineEntry {
  id: string;
  kind: TimelineKind;
  date: string;
  // The underlying record (discriminated by `kind` at the UI layer)
  data: CheckIn | Milestone | TreatmentSession;
}

// ---------------------------------------------------------------------------
// Provider messaging
// ---------------------------------------------------------------------------

export type MessageSender = 'parent' | 'provider';

export interface ProviderMessage {
  id: string;
  senderType: MessageSender;
  /** Display name of sender (provider name, or "You") */
  senderName: string;
  text: string;
  /** ISO datetime string */
  timestamp: string;
  read: boolean;
}

export interface MessageThread {
  id: string;
  providerId: string;
  providerName: string;
  providerRole: string;
  messages: ProviderMessage[];
}

// ---------------------------------------------------------------------------
// AI assistant
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Platform roles, tasks, notes, meetings (multi-account model)
// ---------------------------------------------------------------------------

export type AppRole = 'individual' | 'supporter' | 'facilitator';

export type ClientStatus = 'in_care' | 'completed';

export type PaymentMethod = 'card' | 'cashapp' | 'zelle' | 'venmo' | 'cash' | 'check' | 'other';

export interface Payment {
  id: string;
  individualId: string;
  memberName?: string;
  amountCents: number;
  method: PaymentMethod;
  /** 'paid' = confirmed; 'reported' = member said they paid (CashApp/Zelle), awaiting facilitator confirmation. */
  status: 'paid' | 'reported';
  onTime?: boolean;
  periodMonth?: string;
  /** ISO datetime string */
  paidAt: string;
}

export type LevelOfCare =
  | 'detox'
  | 'residential'
  | 'php'
  | 'iop'
  | 'sober_companion'
  | 'sober_living';

/** Summary row for the facilitator's client list. */
export interface ClientSummary {
  id: string;
  firstName: string;
  lastName?: string;
  phone?: string;
  email?: string;
  houseName?: string;
  houseId?: string;
  programName?: string;
  status: ClientStatus;
  levelOfCare?: LevelOfCare;
  monthlyRentCents?: number;
  rentDueDay?: number;
}

export interface Profile {
  id: string;
  role: AppRole;
  fullName?: string;
  email?: string;
  phone?: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  mustChangePassword?: boolean;
}

export type TaskRecurrence = 'none' | 'daily' | 'weekly';

export interface Task {
  id: string;
  title: string;
  description?: string;
  /** ISO date string */
  dueDate?: string;
  recurrence: TaskRecurrence;
  completed: boolean;
  /** Display name of who created it */
  createdByName: string;
  createdByRole: AppRole;
  /** ISO datetime string */
  createdAt: string;
}

export type NoteVisibility = 'all' | 'supporters' | 'individual' | 'facilitators';

export interface Note {
  id: string;
  body: string;
  visibility: NoteVisibility;
  authorId?: string;
  authorName: string;
  authorRole: AppRole;
  /** ISO datetime string */
  createdAt: string;
  /** STAFF-ONLY file attached to the note (e.g. a UA result). Residents can never open it. */
  attachmentPath?: string;
  attachmentName?: string;
  attachmentMime?: string;
}

export interface Meeting {
  id: string;
  fellowship: 'AA' | 'NA';
  name: string;
  region: string;
  /** 0 = Sunday … 6 = Saturday; undefined = varies */
  dayOfWeek?: number;
  startTime?: string; // "19:30"
  address?: string;
  isOnline: boolean;
  url?: string;
}

export interface SobrietyReset {
  id: string;
  oldDate?: string;
  newDate?: string;
  resetByName: string;
  /** ISO datetime string */
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Community feed + scheduler
// ---------------------------------------------------------------------------

export interface CommunityPost {
  id: string;
  /** Author's profile id (for blocking). Optional on demo/local posts. */
  authorId?: string;
  authorName: string;
  authorRole: AppRole;
  text: string;
  /** Local/remote image URI (optional) */
  imageUri?: string;
  /** ISO datetime string */
  createdAt: string;
  likes: number;
  likedByMe: boolean;
}

export type ScheduleSource = 'manual' | 'photo';

export interface ScheduleEvent {
  id: string;
  title: string;
  /** ISO date string */
  date: string;
  startTime?: string; // "09:00"
  endTime?: string;
  location?: string;
  source: ScheduleSource;
  createdByName: string;
}

export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  /** ISO datetime string */
  timestamp: string;
  /** True when the assistant has surfaced crisis resources in this turn */
  crisisFlagged?: boolean;
}
