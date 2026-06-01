import React from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Screen, ScreenTitle, Card, SectionTitle, Button } from '../components/ui';
import { colors, spacing, typography } from '../theme';
import { useAppState } from '../state/store';
import { ScheduleEvent } from '../types';
import { formatDate } from '../utils/format';

export function ScheduleScreen() {
  const { scheduleEvents, addScheduleEvents, lovedOne } = useAppState();

  // Facilitator imports a schedule by photographing it. OCR/parse is STUBBED:
  // in production the image goes to a vision step (Claude or an OCR service)
  // that extracts events. Here we add a couple of example events so the flow
  // is demoable, and clearly say so.
  const importFromPhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Camera needed', 'Allow camera access to photograph a schedule.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.6 });
    if (result.canceled) return;

    const today = new Date().toISOString().slice(0, 10);
    const parsed: Omit<ScheduleEvent, 'id'>[] = [
      { title: 'Group session', date: today, startTime: '10:00', endTime: '11:00', location: 'Room 2', source: 'photo', createdByName: 'You' },
      { title: 'Individual counseling', date: today, startTime: '14:00', source: 'photo', createdByName: 'You' },
    ];
    addScheduleEvents(parsed);
    Alert.alert(
      'Schedule imported (demo)',
      'In production, the photo is read automatically and the events are extracted. For now I added two example events so you can see them flow to the schedule.',
    );
  };

  // Group events by date.
  const byDate: Record<string, ScheduleEvent[]> = {};
  for (const e of [...scheduleEvents].sort((a, b) => (a.date + (a.startTime ?? '') < b.date + (b.startTime ?? '') ? -1 : 1))) {
    (byDate[e.date] ||= []).push(e);
  }
  const dates = Object.keys(byDate);

  return (
    <Screen>
      <ScreenTitle title="Schedule" subtitle={`${lovedOne.firstName}'s upcoming events`} />

      <Card>
        <SectionTitle>Facilitator: import a schedule</SectionTitle>
        <Text style={[typography.bodySecondary, { marginBottom: spacing.md }]}>
          Snap a photo of the program's schedule and it populates here for the
          individual and their supporters.
        </Text>
        <Button title="📷 Import from photo" onPress={importFromPhoto} />
      </Card>

      {dates.length === 0 ? (
        <Card><Text style={typography.bodySecondary}>No scheduled events yet.</Text></Card>
      ) : (
        dates.map((date) => (
          <View key={date}>
            <SectionTitle>{formatDate(date)}</SectionTitle>
            {byDate[date].map((e) => (
              <Card key={e.id} style={styles.eventRow}>
                <View style={styles.time}>
                  <Text style={styles.timeText}>{e.startTime ?? '—'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={typography.h3}>{e.title}</Text>
                  <Text style={typography.caption}>
                    {e.endTime ? `until ${e.endTime}` : ''}{e.location ? ` · ${e.location}` : ''}
                    {e.source === 'photo' ? ' · from schedule photo' : ''}
                  </Text>
                </View>
              </Card>
            ))}
          </View>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  eventRow: { flexDirection: 'row', alignItems: 'center' },
  time: { width: 60 },
  timeText: { ...typography.h3, color: colors.primary },
});
