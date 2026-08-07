import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Linking, Alert } from 'react-native';
import * as Calendar from 'expo-calendar';
import { Screen, ScreenTitle, Card, Button } from '../components/ui';
import { colors, spacing, radius, typography } from '../theme';
import { useAppState } from '../state/store';
import { useAuth } from '../state/auth';
import { recordMeetingCheckin } from '../services/db';
import { notifyCare } from '../services/push';

type Fellowship = 'AA' | 'NA' | 'SMART' | 'Dharma' | 'GA';
interface Mtg {
  id: string;
  fellowship: Fellowship;
  name: string;
  region: string;
  dayOfWeek: number; // 0 Sun .. 6 Sat
  startTime: string; // "19:00"
  isOnline: boolean;
  address?: string; // only for real, verified in-person meetings
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const FELLOWSHIPS: Fellowship[] = ['AA', 'NA', 'SMART', 'Dharma', 'GA'];
const FELLOWSHIP_COLOR: Record<Fellowship, string> = {
  AA: colors.primary, NA: colors.accent, SMART: '#6C7BD9', Dharma: '#B07BD9', GA: '#D98C5F',
};

// Official, maintained online-meeting finders for each fellowship. These always
// have live meetings running around the clock, so "Join" never hits a dead link.
const FELLOWSHIP_FINDER: Record<Fellowship, string> = {
  AA: 'https://aa-intergroup.org/meetings/',
  NA: 'https://virtual-na.org/meetings/',
  SMART: 'https://meetings.smartrecovery.org/',
  Dharma: 'https://recoverydharma.online/',
  GA: 'https://gamblersanonymous.org/virtual-meetings/',
};

// Gamblers Anonymous runs a searchable directory (in-person / virtual / phone)
// rather than a fixed 24/7 online schedule, so we link straight to the official
// finder + national hotline instead of inventing weekly time slots.
const GA_HOTLINE = '18552255542'; // 855-2CALLGA

/** "19:00" -> "7:00 PM" */
function to12h(hhmm: string): string {
  const [h, m] = hhmm.split(':').map((n) => parseInt(n, 10));
  const period = h >= 12 ? 'PM' : 'AM';
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${String(m).padStart(2, '0')} ${period}`;
}

// A weekly guide to common online meeting formats — NOT a directory of specific
// meetings. "Join online" opens each fellowship's official, always-current finder
// (for AA that's the Online Intergroup at aa-intergroup.org, running 24/7), so the
// button never lands on a stale or dead link.
//
// Every entry here must be either a real, verified meeting or a generic format
// name. Never add placeholder entries with invented addresses: "Add to calendar"
// writes the address straight into a resident's calendar with an alarm, so a fake
// one can send someone in early recovery to a meeting that does not exist.
const MEETINGS: Mtg[] = [
  // ---- AA online (opens the live OIAA Zoom directory) — meetings run 24/7 ----
  // Sunday
  { id: 'aa-su-1', fellowship: 'AA', name: 'Sunday Morning Gratitude', region: 'Online', dayOfWeek: 0, startTime: '08:00', isOnline: true },
  { id: 'aa-su-2', fellowship: 'AA', name: 'Big Book Study', region: 'Online', dayOfWeek: 0, startTime: '10:00', isOnline: true },
  { id: 'aa-su-3', fellowship: 'AA', name: 'As Bill Sees It', region: 'Online', dayOfWeek: 0, startTime: '17:00', isOnline: true },
  { id: 'aa-su-4', fellowship: 'AA', name: 'Candlelight Meeting', region: 'Online', dayOfWeek: 0, startTime: '20:00', isOnline: true },
  // Monday
  { id: 'aa-mo-1', fellowship: 'AA', name: 'Early Bird', region: 'Online', dayOfWeek: 1, startTime: '06:30', isOnline: true },
  { id: 'aa-mo-2', fellowship: 'AA', name: 'Living Sober (Lunchtime)', region: 'Online', dayOfWeek: 1, startTime: '12:00', isOnline: true },
  { id: 'aa-mo-3', fellowship: 'AA', name: 'Beginners Meeting', region: 'Online', dayOfWeek: 1, startTime: '19:00', isOnline: true },
  { id: 'aa-mo-4', fellowship: 'AA', name: 'Night Owl', region: 'Online', dayOfWeek: 1, startTime: '22:00', isOnline: true },
  // Tuesday
  { id: 'aa-tu-1', fellowship: 'AA', name: '11th Step Meditation', region: 'Online', dayOfWeek: 2, startTime: '07:00', isOnline: true },
  { id: 'aa-tu-2', fellowship: 'AA', name: 'Daily Reflections', region: 'Online', dayOfWeek: 2, startTime: '13:00', isOnline: true },
  { id: 'aa-tu-3', fellowship: 'AA', name: 'Step Study', region: 'Online', dayOfWeek: 2, startTime: '18:30', isOnline: true },
  { id: 'aa-tu-4', fellowship: 'AA', name: 'Came to Believe', region: 'Online', dayOfWeek: 2, startTime: '21:00', isOnline: true },
  // Wednesday
  { id: 'aa-we-1', fellowship: 'AA', name: 'Sunrise Sobriety', region: 'Online', dayOfWeek: 3, startTime: '06:00', isOnline: true },
  { id: 'aa-we-2', fellowship: 'AA', name: 'Noon Reflections', region: 'Online', dayOfWeek: 3, startTime: '12:00', isOnline: true },
  { id: 'aa-we-3', fellowship: 'AA', name: 'Grapevine Meeting', region: 'Online', dayOfWeek: 3, startTime: '19:30', isOnline: true },
  { id: 'aa-we-4', fellowship: 'AA', name: '24/7 Marathon (Late Night)', region: 'Online', dayOfWeek: 3, startTime: '23:00', isOnline: true },
  // Thursday
  { id: 'aa-th-1', fellowship: 'AA', name: 'Attitude of Gratitude', region: 'Online', dayOfWeek: 4, startTime: '07:30', isOnline: true },
  { id: 'aa-th-2', fellowship: 'AA', name: 'Lunchtime Serenity', region: 'Online', dayOfWeek: 4, startTime: '12:30', isOnline: true },
  { id: 'aa-th-3', fellowship: 'AA', name: 'Big Book Study', region: 'Online', dayOfWeek: 4, startTime: '18:00', isOnline: true },
  { id: 'aa-th-4', fellowship: 'AA', name: 'Women in Sobriety', region: 'Online', dayOfWeek: 4, startTime: '20:30', isOnline: true },
  // Friday
  { id: 'aa-fr-1', fellowship: 'AA', name: 'Early Bird', region: 'Online', dayOfWeek: 5, startTime: '06:30', isOnline: true },
  { id: 'aa-fr-2', fellowship: 'AA', name: 'Living Sober (Lunchtime)', region: 'Online', dayOfWeek: 5, startTime: '12:00', isOnline: true },
  { id: 'aa-fr-3', fellowship: 'AA', name: 'Primary Purpose', region: 'Online', dayOfWeek: 5, startTime: '19:00', isOnline: true },
  { id: 'aa-fr-4', fellowship: 'AA', name: 'Friday Night Speaker', region: 'Online', dayOfWeek: 5, startTime: '20:00', isOnline: true },
  // Saturday
  { id: 'aa-sa-1', fellowship: 'AA', name: 'Saturday Serenity', region: 'Online', dayOfWeek: 6, startTime: '09:00', isOnline: true },
  { id: 'aa-sa-2', fellowship: 'AA', name: "Men's Meeting", region: 'Online', dayOfWeek: 6, startTime: '11:00', isOnline: true },
  { id: 'aa-sa-3', fellowship: 'AA', name: 'LGBTQ+ Meeting', region: 'Online', dayOfWeek: 6, startTime: '15:00', isOnline: true },
  { id: 'aa-sa-4', fellowship: 'AA', name: 'Speaker Meeting', region: 'Online', dayOfWeek: 6, startTime: '18:00', isOnline: true },

  { id: 'n1', fellowship: 'NA', name: 'Just For Today', region: 'Online', dayOfWeek: 1, startTime: '19:00', isOnline: true },
  { id: 'n3', fellowship: 'NA', name: 'Living Clean', region: 'Online', dayOfWeek: 3, startTime: '20:00', isOnline: true },
  { id: 'n5', fellowship: 'NA', name: 'Saturday Steps', region: 'Online', dayOfWeek: 6, startTime: '11:00', isOnline: true },

  { id: 's1', fellowship: 'SMART', name: 'SMART Recovery', region: 'Online', dayOfWeek: 1, startTime: '17:30', isOnline: true },
  { id: 's3', fellowship: 'SMART', name: 'SMART Weekend', region: 'Online', dayOfWeek: 6, startTime: '09:00', isOnline: true },

  { id: 'd1', fellowship: 'Dharma', name: 'Recovery Dharma', region: 'Online', dayOfWeek: 2, startTime: '18:30', isOnline: true },
  { id: 'd3', fellowship: 'Dharma', name: 'Sunday Sangha', region: 'Online', dayOfWeek: 0, startTime: '17:00', isOnline: true },
];

function nextOccurrence(weekday: number, hhmm: string): Date {
  const [h, min] = hhmm.split(':').map((n) => parseInt(n, 10));
  const d = new Date();
  d.setHours(h, min, 0, 0);
  let add = (weekday - d.getDay() + 7) % 7;
  if (add === 0 && d.getTime() < Date.now()) add = 7;
  d.setDate(d.getDate() + add);
  return d;
}

export function MeetingsScreen() {
  const [filter, setFilter] = useState<'ALL' | Fellowship>('ALL');
  const meetings = MEETINGS.filter((m) => filter === 'ALL' || m.fellowship === filter)
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime));

  const openUrl = (url: string) =>
    Linking.openURL(url).catch(() => Alert.alert('Could not open link', 'Please try again.'));

  // ---- Log any online meeting (paste a Zoom/other link) — moved here from Home ----
  // We can only observe the app stayed open, which is NOT proof of attendance, so
  // these log as self-reported and never earn the confirmed badge. 10 min minimum.
  const { lovedOne } = useAppState();
  const auth = useAuth();
  const isFacilitator = auth.profile?.role === 'facilitator';
  const connected = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(lovedOne?.id || '');
  const ONLINE_MIN_MINUTES = 10;
  const [onlineUrl, setOnlineUrl] = useState('');
  const [onlineStart, setOnlineStart] = useState<number | null>(null);

  const startOnlineMeeting = async () => {
    const url = (onlineUrl || '').trim();
    if (!url) { Alert.alert('Add the meeting link', 'Paste the Zoom (or other) link first.'); return; }
    setOnlineStart(Date.now());
    const full = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    Linking.openURL(full).catch(() => Alert.alert('Could not open that link', 'Check the meeting link and try again.'));
  };

  const finishOnlineMeeting = async () => {
    if (!onlineStart) return;
    const mins = Math.floor((Date.now() - onlineStart) / 60000);
    if (mins < ONLINE_MIN_MINUTES) {
      Alert.alert(
        'Not long enough yet',
        `You've been in the meeting about ${mins} minute${mins === 1 ? '' : 's'}. It logs automatically once you reach ${ONLINE_MIN_MINUTES}.`,
      );
      return;
    }
    try {
      if (connected) {
        await recordMeetingCheckin(lovedOne.id, undefined, undefined, 'Online meeting', 'online', mins);
        notifyCare(lovedOne.id, 'Online meeting', `${lovedOne.firstName} attended an online meeting (${mins} min, self-reported).`, 'activity');
      }
      setOnlineStart(null);
      setOnlineUrl('');
      Alert.alert('Logged ✅', `${mins} minutes recorded. Online meetings are logged as self-reported — your house staff can see it.`);
    } catch (e: any) {
      Alert.alert('Could not log it', e?.message ?? 'Try again.');
    }
  };

  const addToCalendar = async (m: Mtg) => {
    try {
      const { status } = await Calendar.requestCalendarPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission needed', 'Allow calendar access to add this meeting.'); return; }
      const cals = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
      const writable = cals.find((c) => c.allowsModifications) ?? cals[0];
      if (!writable) { Alert.alert('No calendar', 'No writable calendar found.'); return; }
      const start = nextOccurrence(m.dayOfWeek, m.startTime);
      const onlineUrl = m.isOnline ? FELLOWSHIP_FINDER[m.fellowship] : undefined;
      await Calendar.createEventAsync(writable.id, {
        title: `${m.fellowship} — ${m.name}`,
        startDate: start,
        endDate: new Date(start.getTime() + 3600000),
        location: m.isOnline ? 'Online' : m.address,
        notes: onlineUrl ? `Find the live meeting: ${onlineUrl}` : undefined,
        url: onlineUrl,
        alarms: [{ relativeOffset: -15 }],
      });
      Alert.alert('Added', `"${m.name}" was added to your calendar with a 15-minute reminder.`);
    } catch {
      Alert.alert('Could not add', 'Something went wrong adding to your calendar.');
    }
  };

  return (
    <Screen edges={[]}>
      <ScreenTitle title="Meetings" subtitle="AA · NA · SMART · Dharma · GA — online" />

      {/* Log any online meeting (paste your own Zoom/other link). Members only. */}
      {!isFacilitator ? (
        <Card>
          <Text style={typography.h3}>Log an online meeting</Text>
          <Text style={[typography.caption, { marginBottom: spacing.sm }]}>
            {onlineStart
              ? 'Come back and tap “I finished” when the meeting ends.'
              : `In your own Zoom or other meeting? Paste the link — it logs after ${ONLINE_MIN_MINUTES} minutes as self-reported attendance.`}
          </Text>
          {!onlineStart ? (
            <>
              <TextInput
                style={styles.input}
                value={onlineUrl}
                onChangeText={setOnlineUrl}
                placeholder="https://zoom.us/j/…"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                keyboardType="url"
              />
              <View style={{ height: spacing.sm }} />
              <Button title="Join online meeting" onPress={startOnlineMeeting} disabled={!onlineUrl.trim()} />
            </>
          ) : (
            <Button title="I finished the meeting" onPress={finishOnlineMeeting} />
          )}
        </Card>
      ) : null}

      <View style={styles.filters}>
        {(['ALL', ...FELLOWSHIPS] as const).map((f) => (
          <TouchableOpacity key={f} onPress={() => setFilter(f)} style={[styles.filter, filter === f ? styles.filterActive : null]}>
            <Text style={[styles.filterText, filter === f ? styles.filterTextActive : null]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {meetings.map((m) => (
        <Card key={m.id}>
          <View style={styles.row}>
            <View style={[styles.badge, { backgroundColor: FELLOWSHIP_COLOR[m.fellowship] }]}>
              <Text style={styles.badgeText}>{m.fellowship}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={typography.h3}>{m.name}</Text>
              <Text style={typography.caption}>{DAYS[m.dayOfWeek]} · {to12h(m.startTime)} · {m.isOnline ? 'Online' : m.region}</Text>
            </View>
          </View>
          <View style={styles.actions}>
            {m.isOnline ? <View style={{ flex: 1 }}><Button title="Join online →" onPress={() => openUrl(FELLOWSHIP_FINDER[m.fellowship])} /></View> : null}
            <View style={{ flex: 1 }}><Button title="Add to calendar" variant="secondary" onPress={() => addToCalendar(m)} /></View>
          </View>
        </Card>
      ))}

      {/* Gamblers Anonymous — real directory + hotline, no invented time slots. */}
      {filter === 'ALL' || filter === 'GA' ? (
        <Card>
          <View style={styles.row}>
            <View style={[styles.badge, { backgroundColor: FELLOWSHIP_COLOR.GA }]}>
              <Text style={styles.badgeText}>GA</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={typography.h3}>Gamblers Anonymous</Text>
              <Text style={typography.caption}>In-person, virtual &amp; phone meetings · find one by day or location</Text>
            </View>
          </View>
          <View style={styles.actions}>
            <View style={{ flex: 1 }}><Button title="Find a meeting →" onPress={() => openUrl(FELLOWSHIP_FINDER.GA)} /></View>
            <View style={{ flex: 1 }}><Button title="Call 855-2CALLGA" variant="secondary" onPress={() => openUrl(`tel:${GA_HOTLINE}`)} /></View>
          </View>
        </Card>
      ) : null}

      <Text style={styles.note}>
        The weekly times are a guide to common meeting formats. Tap “Join online” to open the
        fellowship’s official directory and join the exact live meeting — AA’s Online Intergroup
        (aa-intergroup.org) runs Zoom meetings 24/7, so there’s almost always one starting soon.
        Gamblers Anonymous uses a searchable directory, so tap “Find a meeting” for its current
        virtual, phone, and in-person schedule.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.md },
  filter: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.surface, marginRight: spacing.sm, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
  filterActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { color: colors.textSecondary, fontWeight: '600', fontSize: 13 },
  filterTextActive: { color: colors.textInverse },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  badge: { borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 4, marginRight: spacing.md },
  badgeText: { color: colors.textInverse, fontWeight: '800', fontSize: 12 },
  actions: { flexDirection: 'row', gap: spacing.sm },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, color: colors.textPrimary, backgroundColor: colors.surface, fontSize: 15 },
  note: { ...typography.caption, marginTop: spacing.sm },
});
