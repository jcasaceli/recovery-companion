/**
 * Lightweight app state for the prototype.
 *
 * Uses React Context + AsyncStorage so data survives app restarts on-device.
 * This is the PROTOTYPE store — in production it is replaced/backed by Supabase
 * (auth + row-level security). See `src/services/supabase.ts` and docs/BACKEND.md.
 * The screen components depend only on the `useAppState()` contract, so swapping
 * the storage layer doesn't touch the UI.
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  LovedOne,
  CheckIn,
  Milestone,
  TreatmentSession,
  MessageThread,
  ProviderMessage,
  MoodLevel,
  TimelineEntry,
  Relationship,
  ProgramType,
  Task,
  Note,
  TaskRecurrence,
  NoteVisibility,
  SobrietyReset,
  CommunityPost,
  ScheduleEvent,
  ClientSummary,
  ClientStatus,
  LevelOfCare,
} from '../types';
import { notifyCareTeam, notifyCare, notifyCommunity, NotifyAudience } from '../services/push';
import { useAuth } from './auth';
import * as dbApi from '../services/db';
import {
  mockLovedOne,
  mockCheckIns,
  mockMilestones,
  mockSessions,
  mockThreads,
} from '../data/mockData';

const STORAGE_KEY = 'recovery-companion:state:v2';

interface PersistedState {
  onboarded: boolean;
  lovedOne: LovedOne;
  checkIns: CheckIn[];
  milestones: Milestone[];
  sessions: TreatmentSession[];
  threads: MessageThread[];
  tasks: Task[];
  notes: Note[];
  /** Facilitator-only audit of sobriety-date resets. Never surfaced to the
   *  individual or supporters in the UI. */
  sobrietyResets: SobrietyReset[];
  /** Whether the individual may use the community feed. Controlled by the
   *  facilitator — some people in treatment can't post photos. */
  communityAccess: boolean;
  posts: CommunityPost[];
  scheduleEvents: ScheduleEvent[];
  /** Facilitator's client list (cloud mode). */
  clients: ClientSummary[];
}

/** Fields collected during onboarding to create the loved-one profile. */
export interface OnboardingInput {
  firstName: string;
  relationship: Relationship;
  programName: string;
  programType: ProgramType;
  treatmentStartDate: string; // ISO yyyy-mm-dd
  sobrietyDate?: string;
}

interface AppState extends PersistedState {
  ready: boolean;
  addCheckIn: (mood: MoodLevel, note: string, tags: string[]) => void;
  toggleCelebrate: (milestoneId: string) => void;
  sendProviderMessage: (threadId: string, text: string) => void;
  markThreadRead: (threadId: string) => void;
  /** Finish onboarding. `demo` seeds the sample data; otherwise starts fresh. */
  completeOnboarding: (input: OnboardingInput | null, demo: boolean) => void;
  /** Wipe everything and return to onboarding (used from Settings). */
  resetApp: () => void;
  /** Add a task/reminder. Notifies the facilitator + individual (+ supporters). */
  addTask: (input: { title: string; description?: string; dueDate?: string; recurrence: TaskRecurrence }) => void;
  toggleTask: (taskId: string) => void;
  /** Add a note. Notifies per audience. */
  addNote: (body: string, visibility: NoteVisibility) => void;
  /** Reset the sobriety date. Logs a facilitator-only audit row and does NOT
   *  notify or alert the individual or supporters. */
  resetSobrietyDate: (newDate: string) => void;
  /** Facilitator toggles whether the individual can use the community feed. */
  setCommunityAccess: (allowed: boolean) => void;
  addPost: (text: string, imageUri?: string) => void;
  togglePostLike: (postId: string) => void;
  /** Add one or many schedule events (bulk = from a facilitator's photo). */
  addScheduleEvents: (events: Omit<ScheduleEvent, 'id'>[]) => void;
  /** Facilitator: create a client (individual) under their org, then load it. */
  createClient: (input: {
    firstName: string;
    lastName?: string;
    phone?: string;
    email?: string;
    houseName?: string;
    monthlyRentCents?: number;
    rentDueDay?: number;
    programName?: string;
    treatmentStartDate?: string;
    sobrietyDate?: string;
    orgName?: string;
    levelOfCare?: LevelOfCare;
  }) => Promise<void>;
  /** Facilitator: open a client (loads their data, enters the main app). */
  selectClient: (id: string) => Promise<void>;
  /** Facilitator: return to the client list. */
  backToClients: () => void;
  /** Facilitator: move a client between In Care / Completed. */
  setClientStatus: (id: string, status: ClientStatus) => Promise<void>;
  /** Facilitator: change a client's level of care. */
  setClientLevel: (id: string, level: LevelOfCare) => Promise<void>;
  /** Facilitator: set a client's monthly rent (cents) + due day (1-31). */
  setRent: (id: string, amountCents: number | null, dueDay: number | null) => Promise<void>;
  /** Facilitator: edit a client's details (name/house/phone/email). */
  updateClient: (id: string, fields: { firstName?: string; lastName?: string; phone?: string; email?: string; houseName?: string }) => Promise<void>;
  /** Re-run the cloud bootstrap (e.g. after a member links via join code). */
  reloadCloud: () => Promise<void>;
  /** Cloud mode only: whether a client is currently open. Always true local. */
  cloudHasIndividual: boolean;
  /** Merged, reverse-chronological feed of all progress events */
  timeline: TimelineEntry[];
}

const AppContext = createContext<AppState | undefined>(undefined);

let idCounter = 0;
function newId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now()}-${idCounter}`;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function logCloud(e: unknown) {
  console.warn('[store] cloud write failed', e);
}

const emptyState: PersistedState = {
  onboarded: false,
  lovedOne: mockLovedOne, // placeholder until onboarding overwrites it
  checkIns: [],
  milestones: [],
  sessions: [],
  threads: [],
  tasks: [],
  notes: [],
  sobrietyResets: [],
  communityAccess: true,
  posts: [],
  scheduleEvents: [],
  clients: [],
};

const demoPosts: CommunityPost[] = [
  { id: 'p-d1', authorName: 'Alex M.', authorRole: 'individual', text: '60 days today. Grateful for this community. 🙏', createdAt: '2026-05-31T14:00:00Z', likes: 12, likedByMe: false },
  { id: 'p-d2', authorName: 'Sam (sober companion)', authorRole: 'facilitator', text: 'Proud of everyone who showed up to group this week. Keep going.', createdAt: '2026-05-30T19:30:00Z', likes: 8, likedByMe: true },
];

const demoSchedule: ScheduleEvent[] = [
  { id: 'se-d1', title: 'Group therapy', date: '2026-06-02', startTime: '10:00', endTime: '11:30', location: 'Brightwater, Room 2', source: 'photo', createdByName: 'Renee Patel' },
  { id: 'se-d2', title: 'NA meeting (Hillside)', date: '2026-06-02', startTime: '19:00', source: 'manual', createdByName: 'Renee Patel' },
];

const demoTasks: Task[] = [
  { id: 't-d1', title: 'Attend an evening NA meeting', description: 'Hillside group, 7:00 PM', recurrence: 'daily', completed: false, createdByName: 'Renee Patel', createdByRole: 'facilitator', createdAt: '2026-05-31T09:00:00Z' },
  { id: 't-d2', title: 'Morning check-in call', recurrence: 'daily', completed: true, createdByName: 'Renee Patel', createdByRole: 'facilitator', createdAt: '2026-05-30T08:00:00Z' },
];

const demoNotes: Note[] = [
  { id: 'n-d1', body: 'Jordan engaged really well in group this week and volunteered to share. Encouraging progress.', visibility: 'all', authorName: 'Dr. Maya Ellis', authorRole: 'facilitator', createdAt: '2026-05-30T16:00:00Z' },
];

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PersistedState>(emptyState);
  const [ready, setReady] = useState(false);

  const auth = useAuth();
  // Cloud mode: Supabase configured AND signed in. Otherwise the store runs the
  // on-device prototype exactly as before.
  const cloud = auth.configured && auth.status === 'signedIn';
  const [individualId, setIndividualId] = useState<string | undefined>(undefined);

  // Local persistence (prototype path only). When Supabase is configured the
  // cloud is authoritative — never read or write the on-device cache.
  useEffect(() => {
    if (auth.configured) {
      setReady(true);
      return;
    }
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        // Merge over emptyState so newer fields always exist (older caches
        // may predate some keys).
        if (raw) setState({ ...emptyState, ...JSON.parse(raw) });
      } catch (e) {
        console.warn('[store] failed to load state', e);
      } finally {
        setReady(true);
      }
    })();
  }, [auth.configured]);

  useEffect(() => {
    if (!ready || auth.configured) return; // never persist when in cloud mode
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch((e) =>
      console.warn('[store] failed to save state', e),
    );
  }, [state, ready, auth.configured]);

  // Load a specific client's full detail into the screen-facing state.
  const loadClientDetail = async (id: string) => {
    const r: any = await dbApi.getIndividual(id);
    if (!r) return;
    const [checkIns, tasks, notes, posts, schedule] = await Promise.all([
      dbApi.listCheckIns(id),
      dbApi.listTasks(id),
      dbApi.listNotes(id),
      dbApi.listPosts(),
      dbApi.listScheduleEvents(id),
    ]);
    setIndividualId(id);
    setState((s) => ({
      ...s,
      onboarded: true,
      lovedOne: {
        id,
        firstName: r.first_name,
        relationship: 'child',
        programName: r.program_name ?? '',
        programType: r.program_type ?? 'outpatient',
        treatmentStartDate: r.treatment_start_date ?? today(),
        sobrietyDate: r.sobriety_date ?? undefined,
        careTeam: [],
      },
      communityAccess: r.community_access ?? false,
      checkIns: (checkIns ?? []).map((c: any) => ({
        id: c.id, date: c.date, mood: c.mood, note: c.note ?? undefined, tags: c.tags ?? [],
      })),
      tasks,
      notes,
      posts,
      scheduleEvents: (schedule ?? []).map((e: any) => ({
        id: e.id, title: e.title, date: e.date, startTime: e.start_time ?? undefined,
        endTime: e.end_time ?? undefined, location: e.location ?? undefined,
        source: e.source, createdByName: 'Care team',
      })),
    }));
  };

  // Bootstrap: facilitators load their client list and stay on it until they
  // pick a client; individuals/supporters auto-load their linked individual.
  const loadCloud = async () => {
    try {
      const profile: any = await dbApi.getMyProfile();
      if (!profile) {
        setState((s) => ({ ...s, onboarded: true }));
        return;
      }
      if (profile.role === 'facilitator') {
        const list = (await dbApi.listFacilitatorIndividuals()) ?? [];
        const clients = list.map((c: any) => ({
          id: c.id,
          firstName: c.first_name,
          lastName: c.last_name ?? undefined,
          phone: c.phone ?? undefined,
          email: c.email ?? undefined,
          houseName: c.house_name ?? undefined,
          programName: c.program_name ?? undefined,
          status: (c.status ?? 'in_care') as 'in_care' | 'completed',
          levelOfCare: c.level_of_care ?? undefined,
          monthlyRentCents: c.monthly_rent_cents ?? undefined,
          rentDueDay: c.rent_due_day ?? undefined,
        }));
        setState((s) => ({ ...s, onboarded: true, clients }));
        return; // no client selected yet → ClientsScreen
      }
      const resolved = await dbApi.resolveMyIndividual();
      if (!resolved) {
        setIndividualId(undefined);
        setState((s) => ({ ...s, onboarded: true }));
        return;
      }
      await loadClientDetail(resolved.individualId);
    } catch (e) {
      console.warn('[store] cloud bootstrap failed', e);
      setState((s) => ({ ...s, onboarded: true }));
    }
  };

  // Bootstrap when signed in (or the user changes).
  useEffect(() => {
    if (cloud) loadCloud();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloud, auth.session?.user?.id]);

  const value = useMemo<AppState>(() => {
    const addCheckIn = (mood: MoodLevel, note: string, tags: string[]) => {
      if (cloud && individualId) dbApi.addCheckIn(individualId, mood, note, tags).catch(logCloud);
      const entry: CheckIn = {
        id: newId('c'),
        date: today(),
        mood,
        note: note.trim() || undefined,
        tags,
      };
      setState((s) => ({ ...s, checkIns: [entry, ...s.checkIns] }));
    };

    const toggleCelebrate = (milestoneId: string) => {
      setState((s) => ({
        ...s,
        milestones: s.milestones.map((m) =>
          m.id === milestoneId ? { ...m, celebrated: !m.celebrated } : m,
        ),
      }));
    };

    const sendProviderMessage = (threadId: string, text: string) => {
      const msg: ProviderMessage = {
        id: newId('pm'),
        senderType: 'parent',
        senderName: 'You',
        text: text.trim(),
        timestamp: new Date().toISOString(),
        read: true,
      };
      setState((s) => ({
        ...s,
        threads: s.threads.map((t) =>
          t.id === threadId ? { ...t, messages: [...t.messages, msg] } : t,
        ),
      }));
    };

    const markThreadRead = (threadId: string) => {
      setState((s) => ({
        ...s,
        threads: s.threads.map((t) =>
          t.id === threadId
            ? { ...t, messages: t.messages.map((m) => ({ ...m, read: true })) }
            : t,
        ),
      }));
    };

    const completeOnboarding = (input: OnboardingInput | null, demo: boolean) => {
      if (demo) {
        setState({
          onboarded: true,
          lovedOne: mockLovedOne,
          checkIns: mockCheckIns,
          milestones: mockMilestones,
          sessions: mockSessions,
          threads: mockThreads,
          tasks: demoTasks,
          notes: demoNotes,
          sobrietyResets: [],
          communityAccess: true,
          posts: demoPosts,
          scheduleEvents: demoSchedule,
          clients: [],
        });
        return;
      }
      if (!input) return;
      const lovedOne: LovedOne = {
        id: newId('lo'),
        firstName: input.firstName.trim(),
        relationship: input.relationship,
        programName: input.programName.trim(),
        programType: input.programType,
        treatmentStartDate: input.treatmentStartDate,
        sobrietyDate: input.sobrietyDate,
        careTeam: [],
      };
      // Start fresh — no fabricated history about a real person. Seed one
      // milestone marking the start of treatment.
      const starter: Milestone = {
        id: newId('m'),
        date: input.treatmentStartDate,
        title: 'Started treatment',
        description: `Began ${input.programName.trim()}.`,
        category: 'treatment',
        celebrated: true,
      };
      setState({
        onboarded: true,
        lovedOne,
        checkIns: [],
        milestones: [starter],
        sessions: [],
        threads: [],
        tasks: [],
        notes: [],
        sobrietyResets: [],
        // Community is off until the facilitator grants access (some people in
        // treatment can't post photos).
        communityAccess: false,
        posts: [],
        scheduleEvents: [],
        clients: [],
      });
    };

    const resetApp = () => setState(emptyState);

    // Tasks/notes notify the whole care team. The UI shows who that is.
    const TASK_NOTE_AUDIENCES: NotifyAudience[] = ['facilitator', 'individual', 'supporters'];

    const addTask: AppState['addTask'] = (input) => {
      if (cloud && individualId)
        dbApi.addTask(individualId, { title: input.title, description: input.description, dueDate: input.dueDate, recurrence: input.recurrence }).catch(logCloud);
      const task: Task = {
        id: newId('t'),
        title: input.title.trim(),
        description: input.description?.trim() || undefined,
        dueDate: input.dueDate,
        recurrence: input.recurrence,
        completed: false,
        createdByName: 'You',
        createdByRole: 'supporter',
        createdAt: new Date().toISOString(),
      };
      setState((s) => ({ ...s, tasks: [task, ...s.tasks] }));
      if (cloud && individualId) {
        notifyCare(individualId, 'New task added', `"${task.title}" was shared.`);
      } else {
        notifyCareTeam({ title: 'New task added', body: `"${task.title}" was shared with ${state.lovedOne.firstName}.`, audiences: TASK_NOTE_AUDIENCES });
      }
    };

    const toggleTask = (taskId: string) => {
      setState((s) => ({
        ...s,
        tasks: s.tasks.map((t) =>
          t.id === taskId ? { ...t, completed: !t.completed } : t,
        ),
      }));
    };

    const addNote: AppState['addNote'] = (body, visibility) => {
      if (cloud && individualId) dbApi.addNote(individualId, body, visibility).catch(logCloud);
      const note: Note = {
        id: newId('n'),
        body: body.trim(),
        visibility,
        authorName: 'You',
        authorRole: 'supporter',
        createdAt: new Date().toISOString(),
      };
      setState((s) => ({ ...s, notes: [note, ...s.notes] }));
      if (cloud && individualId) {
        notifyCare(individualId, 'New note added', 'A new note was shared.');
      } else {
        notifyCareTeam({ title: 'New note added', body: `A note about ${state.lovedOne.firstName} was shared.`, audiences: TASK_NOTE_AUDIENCES });
      }
    };

    // Resets are LOGGED for the facilitator only and never announced to the
    // individual or supporters — no notifyCareTeam() call here, by design.
    const resetSobrietyDate: AppState['resetSobrietyDate'] = (newDate) => {
      if (cloud && individualId) dbApi.resetSobrietyDate(individualId, newDate).catch(logCloud);
      setState((s) => {
        const audit: SobrietyReset = {
          id: newId('sr'),
          oldDate: s.lovedOne.sobrietyDate,
          newDate,
          resetByName: 'You',
          createdAt: new Date().toISOString(),
        };
        return {
          ...s,
          lovedOne: { ...s.lovedOne, sobrietyDate: newDate },
          sobrietyResets: [audit, ...s.sobrietyResets],
        };
      });
    };

    const setCommunityAccess = (allowed: boolean) => {
      if (cloud && individualId) dbApi.setCommunityAccess(individualId, allowed).catch(logCloud);
      setState((s) => ({ ...s, communityAccess: allowed }));
    };

    const addPost: AppState['addPost'] = (text, imageUri) => {
      if (cloud) dbApi.createPost(text, imageUri).catch(logCloud);
      const post: CommunityPost = {
        id: newId('p'),
        authorName: 'You',
        authorRole: 'individual',
        text: text.trim(),
        imageUri,
        createdAt: new Date().toISOString(),
        likes: 0,
        likedByMe: false,
      };
      setState((s) => ({ ...s, posts: [post, ...s.posts] }));
      if (cloud) notifyCommunity('New community post', 'Someone shared in the community.');
    };

    const togglePostLike = (postId: string) => {
      if (cloud) {
        const willLike = !state.posts.find((p) => p.id === postId)?.likedByMe;
        dbApi.toggleLike(postId, willLike).catch(logCloud);
      }
      setState((s) => ({
        ...s,
        posts: s.posts.map((p) =>
          p.id === postId
            ? { ...p, likedByMe: !p.likedByMe, likes: p.likes + (p.likedByMe ? -1 : 1) }
            : p,
        ),
      }));
    };

    const addScheduleEvents: AppState['addScheduleEvents'] = (events) => {
      if (cloud && individualId)
        events.forEach((e) =>
          dbApi.addScheduleEvent(individualId, { title: e.title, date: e.date, startTime: e.startTime, endTime: e.endTime, location: e.location, source: e.source }).catch(logCloud),
        );
      const withIds: ScheduleEvent[] = events.map((e) => ({ ...e, id: newId('se') }));
      setState((s) => ({ ...s, scheduleEvents: [...s.scheduleEvents, ...withIds] }));
      // A new schedule shared by the facilitator notifies the care team.
      notifyCareTeam({
        title: 'Schedule updated',
        body: `${withIds.length} event(s) were added to ${state.lovedOne.firstName}'s schedule.`,
        audiences: ['individual', 'supporters'],
      });
    };

    const createClient: AppState['createClient'] = async (input) => {
      if (!cloud) return;
      const orgId = await dbApi.ensureFacilitatorOrg(input.orgName?.trim() || 'My Organization');
      await dbApi.createIndividual({
        orgId,
        firstName: input.firstName.trim(),
        lastName: input.lastName?.trim() || undefined,
        phone: input.phone?.trim() || undefined,
        email: input.email?.trim() || undefined,
        houseName: input.houseName?.trim() || undefined,
        monthlyRentCents: input.monthlyRentCents,
        rentDueDay: input.rentDueDay,
        programName: input.programName?.trim() || undefined,
        treatmentStartDate: input.treatmentStartDate || undefined,
        sobrietyDate: input.sobrietyDate || undefined,
        levelOfCare: input.levelOfCare || undefined,
      });
      await loadCloud(); // refresh the client list (stays on the Clients page)
    };

    const selectClient: AppState['selectClient'] = async (id) => {
      if (cloud) await loadClientDetail(id);
    };

    const backToClients = () => {
      setIndividualId(undefined);
      if (cloud) loadCloud();
    };

    const setClientStatus: AppState['setClientStatus'] = async (id, status) => {
      if (cloud) await dbApi.updateClientStatus(id, status).catch(logCloud);
      setState((s) => ({
        ...s,
        clients: s.clients.map((c) => (c.id === id ? { ...c, status } : c)),
      }));
    };

    const setClientLevel: AppState['setClientLevel'] = async (id, level) => {
      if (cloud) await dbApi.updateClientLevel(id, level).catch(logCloud);
      setState((s) => ({
        ...s,
        clients: s.clients.map((c) => (c.id === id ? { ...c, levelOfCare: level } : c)),
      }));
    };

    const setRent: AppState['setRent'] = async (id, amountCents, dueDay) => {
      if (cloud) await dbApi.setMemberRent(id, amountCents, dueDay).catch(logCloud);
      setState((s) => ({
        ...s,
        clients: s.clients.map((c) =>
          c.id === id ? { ...c, monthlyRentCents: amountCents ?? undefined, rentDueDay: dueDay ?? undefined } : c,
        ),
      }));
    };

    const updateClient: AppState['updateClient'] = async (id, fields) => {
      if (cloud) await dbApi.updateClient(id, fields);
      setState((s) => ({
        ...s,
        clients: s.clients.map((c) => (c.id === id ? { ...c, ...fields } : c)),
      }));
    };

    const timeline: TimelineEntry[] = [
      ...state.checkIns.map((c) => ({ id: c.id, kind: 'check-in' as const, date: c.date, data: c })),
      ...state.milestones.map((m) => ({ id: m.id, kind: 'milestone' as const, date: m.date, data: m })),
      ...state.sessions.map((sn) => ({ id: sn.id, kind: 'session' as const, date: sn.date, data: sn })),
    ].sort((a, b) => (a.date < b.date ? 1 : -1));

    return {
      ...state,
      ready,
      addCheckIn,
      toggleCelebrate,
      sendProviderMessage,
      markThreadRead,
      completeOnboarding,
      resetApp,
      addTask,
      toggleTask,
      addNote,
      resetSobrietyDate,
      setCommunityAccess,
      addPost,
      togglePostLike,
      addScheduleEvents,
      createClient,
      selectClient,
      backToClients,
      setClientStatus,
      setClientLevel,
      setRent,
      updateClient,
      reloadCloud: async () => { if (cloud) await loadCloud(); },
      cloudHasIndividual: cloud ? !!individualId : true,
      timeline,
    };
  }, [state, ready, cloud, individualId]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppState(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider');
  return ctx;
}
