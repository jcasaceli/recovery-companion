import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert, TextInput, TouchableOpacity } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Calendar from 'expo-calendar';
import { Screen, ScreenTitle, Card, SectionTitle, Button } from '../components/ui';
import { colors, spacing, radius, typography } from '../theme';
import { useAppState } from '../state/store';
import { ScheduleEvent } from '../types';
import { formatDate } from '../utils/format';

export function ScheduleScreen() {
  const { scheduleEvents, addScheduleEvents, lovedOne } = useAppState();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState('');
  const [location, setLocation] = useState('');

  const addManual = () => {
    if (!title.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      Alert.alert('Add a title and a valid date', 'Date should be YYYY-MM-DD.');
      return;
    }
    addScheduleEvents([{ title: title.trim(), date, startTime: time || undefined, location: location || undefined, source: 'manual', createdByName: 'You' }]);
    setTitle(''); setTime(''); setLocation(''); setAdding(false);
  };

  // Photo import (OCR stubbed): add example events so the flow is demoable.
  const importFromPhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Camera needed', 'Allow camera access to photograph a schedule.'); return; }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.6 });
    if (result.canceled) return;
    const today = new Date().toISOString().slice(0, 10);
    addScheduleEvents([
      { title: 'Group session', date: today, startTime: '10:00', endTime: '11:00', location: 'Room 2', source: 'photo', createdByName: 'You' },
      { title: 'Individual counseling', date: today, startTime: '14:00', source: 'photo', createdByName: 'You' },
    ]);
    Alert.alert('Schedule imported (demo)', 'In production the photo is read automatically. For now I added two example events.');
  };

  const addToCalendar = async (e: ScheduleEvent) => {
    try {
      const { status } = await Calendar.requestCalendarPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission needed', 'Allow calendar access.'); return; }
      const cals = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
      const writable = cals.find((c) => c.allowsModifications) ?? cals[0];
      if (!writable) { Alert.alert('No calendar', 'No writable calendar found.'); return; }
      const [h, m] = (e.startTime || '09:00').split(':').map((n) => parseInt(n, 10));
      const start = new Date(`${e.date}T00:00:00`); start.setHours(h, m, 0, 0);
      await Calendar.createEventAsync(writable.id, {
        title: e.title,
        startDate: start,
        endDate: new Date(start.getTime() + 3600000),
        location: e.location,
        alarms: [{ relativeOffset: -30 }],
      });
      Alert.alert('Added to calendar', `"${e.title}" was added with a 30-minute reminder.`);
    } catch {
      Alert.alert('Could not add', 'Something went wrong.');
    }
  };

  const byDate: Record<string, ScheduleEvent[]> = {};
  for (const e of [...scheduleEvents].sort((a, b) => (a.date + (a.startTime ?? '') < b.date + (b.startTime ?? '') ? -1 : 1))) {
    (byDate[e.date] ||= []).push(e);
  }
  const dates = Object.keys(byDate);

  return (
    <Screen>
      <ScreenTitle title="Schedule" subtitle={`${lovedOne.firstName}'s events`} />

      <Card>
        <SectionTitle>Add an event</SectionTitle>
        {!adding ? (
          <>
            <Button title="+ Add manually" onPress={() => setAdding(true)} />
            <View style={{ height: spacing.sm }} />
            <Button title="📷 Import from a photo" variant="secondary" onPress={importFromPhoto} />
          </>
        ) : (
          <>
            <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Event title (e.g. NA meeting)" placeholderTextColor={colors.textMuted} />
            <TextInput style={styles.input} value={date} onChangeText={setDate} placeholder="Date (YYYY-MM-DD)" placeholderTextColor={colors.textMuted} autoCapitalize="none" />
            <TextInput style={styles.input} value={time} onChangeText={setTime} placeholder="Start time (e.g. 19:00) — optional" placeholderTextColor={colors.textMuted} />
            <TextInput style={styles.input} value={location} onChangeText={setLocation} placeholder="Location (optional)" placeholderTextColor={colors.textMuted} />
            <Button title="Add event" onPress={addManual} disabled={!title.trim()} />
            <TouchableOpacity onPress={() => setAdding(false)} style={styles.cancel}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
          </>
        )}
      </Card>

      {dates.length === 0 ? (
        <Card><Text style={typography.bodySecondary}>No scheduled events yet.</Text></Card>
      ) : (
        dates.map((d) => (
          <View key={d}>
            <SectionTitle>{formatDate(d)}</SectionTitle>
            {byDate[d].map((e) => (
              <Card key={e.id}>
                <View style={styles.eventRow}>
                  <View style={styles.time}><Text style={styles.timeText}>{e.startTime ?? '—'}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={typography.h3}>{e.title}</Text>
                    <Text style={typography.caption}>
                      {e.endTime ? `until ${e.endTime}` : ''}{e.location ? ` · ${e.location}` : ''}
                      {e.source === 'photo' ? ' · from photo' : ''}
                    </Text>
                  </View>
                </View>
                <Button title="Add to calendar" variant="secondary" onPress={() => addToCalendar(e)} />
              </Card>
            ))}
          </View>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, fontSize: 15, color: colors.textPrimary, marginBottom: spacing.sm },
  cancel: { alignItems: 'center', paddingVertical: spacing.sm },
  cancelText: { color: colors.textSecondary },
  eventRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  time: { width: 60 },
  timeText: { ...typography.h3, color: colors.primary },
});
