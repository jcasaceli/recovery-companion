import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Alert } from 'react-native';
import * as Calendar from 'expo-calendar';
import { Screen, ScreenTitle, Card, Button } from '../components/ui';
import { colors, spacing, radius, typography } from '../theme';

type Fellowship = 'AA' | 'NA' | 'SMART' | 'Dharma';
interface Mtg {
  id: string;
  fellowship: Fellowship;
  name: string;
  region: string;
  dayOfWeek: number; // 0 Sun .. 6 Sat
  startTime: string; // "19:00"
  isOnline: boolean;
  address?: string;
  zoomUrl?: string;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const FELLOWSHIPS: Fellowship[] = ['AA', 'NA', 'SMART', 'Dharma'];
const FELLOWSHIP_COLOR: Record<Fellowship, string> = {
  AA: colors.primary, NA: colors.accent, SMART: '#6C7BD9', Dharma: '#B07BD9',
};

// A packed weekly schedule of demo meetings (online + local). In production this
// comes from live AA/NA/SMART/Dharma directories filtered by the member's area.
const MEETINGS: Mtg[] = [
  // Daily online "anytime" options
  { id: 'm1', fellowship: 'AA', name: 'Early Bird (Online)', region: 'Online', dayOfWeek: 1, startTime: '06:30', isOnline: true, zoomUrl: 'https://zoom.us/j/1000001' },
  { id: 'm2', fellowship: 'AA', name: 'Sunrise Sobriety (Online)', region: 'Online', dayOfWeek: 2, startTime: '07:00', isOnline: true, zoomUrl: 'https://zoom.us/j/1000002' },
  { id: 'm3', fellowship: 'AA', name: 'Noon Reflections (Online)', region: 'Online', dayOfWeek: 3, startTime: '12:00', isOnline: true, zoomUrl: 'https://zoom.us/j/1000003' },
  { id: 'm4', fellowship: 'AA', name: 'Big Book Study (Online)', region: 'Online', dayOfWeek: 4, startTime: '18:00', isOnline: true, zoomUrl: 'https://zoom.us/j/1000004' },
  { id: 'm5', fellowship: 'AA', name: 'Candlelight (Online)', region: 'Online', dayOfWeek: 5, startTime: '20:00', isOnline: true, zoomUrl: 'https://zoom.us/j/1000005' },
  { id: 'm6', fellowship: 'AA', name: 'Sunday Serenity (Online)', region: 'Online', dayOfWeek: 0, startTime: '10:00', isOnline: true, zoomUrl: 'https://zoom.us/j/1000006' },

  { id: 'n1', fellowship: 'NA', name: 'Just For Today (Online)', region: 'Online', dayOfWeek: 1, startTime: '19:00', isOnline: true, zoomUrl: 'https://zoom.us/j/2000001' },
  { id: 'n2', fellowship: 'NA', name: 'Hillside Group', region: 'Austin, TX', dayOfWeek: 2, startTime: '19:30', isOnline: false, address: '123 Hill St' },
  { id: 'n3', fellowship: 'NA', name: 'Living Clean (Online)', region: 'Online', dayOfWeek: 3, startTime: '20:00', isOnline: true, zoomUrl: 'https://zoom.us/j/2000003' },
  { id: 'n4', fellowship: 'NA', name: 'We Do Recover', region: 'Austin, TX', dayOfWeek: 5, startTime: '18:30', isOnline: false, address: '900 Recovery Rd' },
  { id: 'n5', fellowship: 'NA', name: 'Saturday Steps (Online)', region: 'Online', dayOfWeek: 6, startTime: '11:00', isOnline: true, zoomUrl: 'https://zoom.us/j/2000005' },

  { id: 's1', fellowship: 'SMART', name: 'SMART Recovery (Online)', region: 'Online', dayOfWeek: 1, startTime: '17:30', isOnline: true, zoomUrl: 'https://zoom.us/j/3000001' },
  { id: 's2', fellowship: 'SMART', name: 'SMART Tools & Techniques', region: 'Austin, TX', dayOfWeek: 3, startTime: '18:00', isOnline: false, address: '55 Wellness Ave' },
  { id: 's3', fellowship: 'SMART', name: 'SMART Weekend (Online)', region: 'Online', dayOfWeek: 6, startTime: '09:00', isOnline: true, zoomUrl: 'https://zoom.us/j/3000003' },

  { id: 'd1', fellowship: 'Dharma', name: 'Recovery Dharma (Online)', region: 'Online', dayOfWeek: 2, startTime: '18:30', isOnline: true, zoomUrl: 'https://zoom.us/j/4000001' },
  { id: 'd2', fellowship: 'Dharma', name: 'Dharma Meditation & Recovery', region: 'Austin, TX', dayOfWeek: 4, startTime: '19:00', isOnline: false, address: '12 Lotus Ln' },
  { id: 'd3', fellowship: 'Dharma', name: 'Sunday Sangha (Online)', region: 'Online', dayOfWeek: 0, startTime: '17:00', isOnline: true, zoomUrl: 'https://zoom.us/j/4000003' },
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

  const openZoom = (url: string) =>
    Linking.openURL(url).catch(() => Alert.alert('Could not open Zoom', 'Make sure the Zoom app is installed.'));

  const addToCalendar = async (m: Mtg) => {
    try {
      const { status } = await Calendar.requestCalendarPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission needed', 'Allow calendar access to add this meeting.'); return; }
      const cals = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
      const writable = cals.find((c) => c.allowsModifications) ?? cals[0];
      if (!writable) { Alert.alert('No calendar', 'No writable calendar found.'); return; }
      const start = nextOccurrence(m.dayOfWeek, m.startTime);
      await Calendar.createEventAsync(writable.id, {
        title: `${m.fellowship} — ${m.name}`,
        startDate: start,
        endDate: new Date(start.getTime() + 3600000),
        location: m.isOnline ? (m.zoomUrl ?? 'Online') : m.address,
        notes: m.zoomUrl ? `Join: ${m.zoomUrl}` : undefined,
        url: m.zoomUrl,
        alarms: [{ relativeOffset: -15 }],
      });
      Alert.alert('Added', `"${m.name}" was added to your calendar with a 15-minute reminder.`);
    } catch {
      Alert.alert('Could not add', 'Something went wrong adding to your calendar.');
    }
  };

  return (
    <Screen>
      <ScreenTitle title="Meetings" subtitle="AA · NA · SMART · Dharma — online & local" />

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
              <Text style={typography.caption}>{DAYS[m.dayOfWeek]} · {m.startTime} · {m.isOnline ? 'Online' : m.region}</Text>
            </View>
          </View>
          <View style={styles.actions}>
            {m.zoomUrl ? <View style={{ flex: 1 }}><Button title="Join on Zoom" onPress={() => openZoom(m.zoomUrl!)} /></View> : null}
            <View style={{ flex: 1 }}><Button title="Add to calendar" variant="secondary" onPress={() => addToCalendar(m)} /></View>
          </View>
        </Card>
      ))}

      <Text style={styles.note}>Times are examples. Production pulls live listings for your area.</Text>
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
  note: { ...typography.caption, marginTop: spacing.sm },
});
