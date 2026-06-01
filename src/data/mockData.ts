/**
 * Mock data for the prototype. Entirely fictional — there is NO real patient
 * information anywhere in this app. Do not replace with real data until the
 * HIPAA / 42 CFR Part 2 compliant backend and consent flows are in place.
 */

import {
  LovedOne,
  CheckIn,
  Milestone,
  TreatmentSession,
  MessageThread,
} from '../types';

export const mockLovedOne: LovedOne = {
  id: 'lo-1',
  firstName: 'Jordan',
  relationship: 'son',
  programName: 'Brightwater Recovery Center',
  programType: 'iop',
  treatmentStartDate: '2026-03-10',
  sobrietyDate: '2026-03-02',
  careTeam: [
    {
      id: 'prov-1',
      name: 'Dr. Maya Ellis',
      role: 'Primary Counselor',
      organization: 'Brightwater Recovery Center',
    },
    {
      id: 'prov-2',
      name: 'Dr. Sam Okafor',
      role: 'Psychiatrist',
      organization: 'Brightwater Recovery Center',
    },
    {
      id: 'prov-3',
      name: 'Renee Patel',
      role: 'Family Case Manager',
      organization: 'Brightwater Recovery Center',
    },
  ],
};

export const mockCheckIns: CheckIn[] = [
  { id: 'c-1', date: '2026-05-31', mood: 4, note: 'Good phone call today — he sounded hopeful.', tags: ['hopeful', 'phone call'] },
  { id: 'c-2', date: '2026-05-29', mood: 3, note: 'A bit quiet but okay.', tags: ['quiet'] },
  { id: 'c-3', date: '2026-05-27', mood: 2, note: 'Tough day, missed a group session.', tags: ['anxious', 'missed session'] },
  { id: 'c-4', date: '2026-05-24', mood: 4, tags: ['steady'] },
  { id: 'c-5', date: '2026-05-20', mood: 5, note: 'Family therapy went really well.', tags: ['hopeful', 'family therapy'] },
];

export const mockMilestones: Milestone[] = [
  { id: 'm-1', date: '2026-06-01', title: '90 days', description: '90 days into recovery.', category: 'recovery', celebrated: false },
  { id: 'm-2', date: '2026-05-20', title: 'First family therapy session', category: 'treatment', celebrated: true },
  { id: 'm-3', date: '2026-04-01', title: '30 days', description: 'One month milestone.', category: 'recovery', celebrated: true },
  { id: 'm-4', date: '2026-03-10', title: 'Started IOP', description: 'Began the intensive outpatient program.', category: 'treatment', celebrated: true },
];

export const mockSessions: TreatmentSession[] = [
  { id: 's-1', date: '2026-05-30', type: 'group-therapy', providerId: 'prov-1', attended: true },
  { id: 's-2', date: '2026-05-28', type: 'individual-therapy', providerId: 'prov-1', attended: true, note: 'Worked on coping strategies.' },
  { id: 's-3', date: '2026-05-27', type: 'group-therapy', providerId: 'prov-1', attended: false, note: 'Missed.' },
  { id: 's-4', date: '2026-05-25', type: 'psychiatry', providerId: 'prov-2', attended: true, note: 'Medication review.' },
  { id: 's-5', date: '2026-05-20', type: 'family-therapy', providerId: 'prov-1', attended: true },
];

export const mockThreads: MessageThread[] = [
  {
    id: 't-1',
    providerId: 'prov-3',
    providerName: 'Renee Patel',
    providerRole: 'Family Case Manager',
    messages: [
      { id: 'pm-1', senderType: 'provider', senderName: 'Renee Patel', text: "Hi! Just checking in — Jordan had a strong week. The team is really encouraged. Let me know if you have any questions.", timestamp: '2026-05-30T15:20:00Z', read: true },
      { id: 'pm-2', senderType: 'parent', senderName: 'You', text: "Thank you so much, that means a lot to hear. Is there anything we should focus on during our next visit?", timestamp: '2026-05-30T18:05:00Z', read: true },
      { id: 'pm-3', senderType: 'provider', senderName: 'Renee Patel', text: "Great question — I'll loop in Dr. Ellis and we'll share a few talking points before Saturday.", timestamp: '2026-05-31T13:10:00Z', read: false },
    ],
  },
  {
    id: 't-2',
    providerId: 'prov-1',
    providerName: 'Dr. Maya Ellis',
    providerRole: 'Primary Counselor',
    messages: [
      { id: 'pm-4', senderType: 'provider', senderName: 'Dr. Maya Ellis', text: "Looking forward to our family therapy session next week. Please bring any questions you have.", timestamp: '2026-05-15T16:00:00Z', read: true },
    ],
  },
];
