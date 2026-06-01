import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Alert, Platform } from 'react-native';
import * as Calendar from 'expo-calendar';
import { Screen, ScreenTitle, Card, Button } from '../components/ui';
import { colors, spacing, radius, typography } from '../theme';
import { Meeting } from '../types';

// Demo meeting data. In production this comes from the `meetings` table
// (db.listMeetings) filtered by the user's region, or a live AA/NA feed.
const DEMO_MEETINGS: (Meeting & { zoomUrl?: string })[] = [
  { id: 'm1', fellowship: 'AA', name: 'Sunrise Sobriety (Online)', region: 'Austin, TX', dayOfWeek: 1, startTime: '07:00', isOnline: true, zoomUrl: 'https://zoom.us/j/0000000001', url: 'https://aa-intergroup.org' },
  { id: 'm2', fellowship: 'NA', name: 'Hillside Group', region: 'Austin, TX', dayOfWeek: 2, startTime: '19:00', address: '123 Hill St', isOnline: false },
  { id: 'm3', fellowship: 'AA', name: 'Noon Reflections (Online)', region: 'Austin, TX', dayOfWeek: 3, startTime: '12:00', isOnline: true, zoomUrl: 'https://zoom.us/j/0000000003' },
  { id: 'm4', fellowship: 'NA', name: 'Just For Today (Online)', region: 'Austin, TX', dayOfWeek: 5, startTime: '20:00', isOnline: true, zoomUrl: 'https://zoom.us/j/0000000004' },
];

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function MeetingsScreen() {
  const [filter, setFilter] = useState<'ALL' | 'AA' | 'NA'>('ALL');
  const meetings = DEMO_MEETINGS.filter((m) => filter === 'ALL' || m.fellowship === filter);

  const openZoom = (url: string) => {
    // Opening the https Zoom link hands off to the Zoom app if installed.
    Linking.openURL(url).catch(() =>
      Alert.alert('Could not open Zoom', 'Make sure the Zoom app is installed.'),
    );
  };

  const addToCalendar = async (m: Meeting & { zoomUrl?: string }) => {
    try {
      const { status } = await Calendar.requestCalendarPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Allow calendar access to add this meeting.');
        return;
      }
      const cals = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
      const writable = cals.find((c) => c.allowsModifications) ?? cals[0];
      if (!writable) {
        Alert.alert('No calendar', 'No writable calendar found on this device.');
        return;
      }
      // Next occurrence of this weekday at the meeting time.
      const start = nextOccurrence(m.dayOfWeek ?? 0, m.startTime ?? '12:00');
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      await Calendar.createEventAsync(writable.id, {
        title: `${m.fellowship} — ${m.name}`,
        startDate: start,
        endDate: end,
        location: m.isOnline ? (m.zoomUrl ?? 'Online') : m.address,
        notes: m.zoomUrl ? `Join: ${m.zoomUrl}` : undefined,
        url: m.zoomUrl,
        alarms: [{ relativeOffset: -15 }], // remind 15 min before
      });
      Alert.alert('Added', `"${m.name}" was added to your calendar with a 15-minute reminder.`);
    } catch (e) {
      Alert.alert('Could not add', 'Something went wrong adding to your calendar.');
    }
  };

  return (
    <Screen>
      <ScreenTitle title="Meetings" subtitle="AA & NA — online and near you" />

      <View style={styles.filters}>
        {(['ALL', 'AA', 'NA'] as const).map((f) => (
          <TouchableOpacity
            key={f}
            onPress={() => setFilter(f)}
            style={[styles.filter, filter === f ? styles.filterActive : null]}
          >
            <Text style={[styles.filterText, filter === f ? styles.filterTextActive : null]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {meetings.map((m) => (
        <Card key={m.id}>
          <View style={styles.row}>
            <View style={[styles.badge, { backgroundColor: m.fellowship === 'AA' ? colors.primary : colors.accent }]}>
              <Text style={styles.badgeText}>{m.fellowship}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={typography.h3}>{m.name}</Text>
              <Text style={typography.caption}>
                {m.dayOfWeek != null ? DAYS[m.dayOfWeek] : 'Varies'}
                {m.startTime ? ` · ${m.startTime}` : ''} · {m.isOnline ? 'Online' : m.region}
              </Text>
            </View>
          </View>
          <View style={styles.actions}>
            {m.zoomUrl ? (
              <View style={{ flex: 1 }}>
                <Button title="Join on Zoom" onPress={() => openZoom(m.zoomUrl!)} />
              </View>
            ) : null}
            <View style={{ flex: 1 }}>
              <Button title="Add to calendar" variant="secondary" onPress={() => addToCalendar(m)} />
            </View>
          </View>
        </Card>
      ))}

      <Text style={styles.note}>
        Meeting times are examples. Production pulls live AA/NA listings for your area.
      </Text>
    </Screen>
  );
}

function nextOccurrence(weekday: number, hhmm: string): Date {
  const [h, min] = hhmm.split(':').map((n) => parseInt(n, 10));
  const d = new Date();
  d.setHours(h, min, 0, 0);
  let add = (weekday - d.getDay() + 7) % 7;
  if (add === 0 && d.getTime() < Date.now()) add = 7;
  d.setDate(d.getDate() + add);
  return d;
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', marginBottom: spacing.md },
  filter: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    marginRight: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { color: colors.textSecondary, fontWeight: '600' },
  filterTextActive: { color: colors.textInverse },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  badge: { borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 4, marginRight: spacing.md },
  badgeText: { color: colors.textInverse, fontWeight: '800', fontSize: 13 },
  actions: { flexDirection: 'row', gap: spacing.sm },
  note: { ...typography.caption, marginTop: spacing.sm },
});
