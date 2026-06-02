import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Platform, Modal, TextInput } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Screen, ScreenTitle, Card, SectionTitle, Button } from '../components/ui';
import { notifyCareTeam, notifyCare } from '../services/push';
import { recordMeetingCheckin } from '../services/db';
import * as Location from 'expo-location';
import { colors, spacing, radius, typography, shadow } from '../theme';
import { useAppState } from '../state/store';
import { useAuth } from '../state/auth';
import { TimelineEntry, CheckIn, Milestone, TreatmentSession } from '../types';
import {
  daysSince,
  formatDate,
  MOOD_EMOJI,
  MOOD_LABELS,
  PROGRAM_LABELS,
} from '../utils/format';

export function HomeScreen() {
  const nav = useNavigation<any>();
  const { lovedOne, checkIns, milestones, timeline, backToClients, resetSobrietyDate, addNote } = useAppState();
  const auth = useAuth();
  const isFacilitator = auth.profile?.role === 'facilitator';
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertText, setAlertText] = useState('');

  const sendAlert = () => {
    if (!alertText.trim()) return;
    addNote(alertText.trim(), 'facilitators'); // visible to the facilitator only
    setAlertText('');
    setAlertOpen(false);
    Alert.alert('Sent to your facilitator', 'They’ll see this on your profile.');
  };

  const onSobrietyDate = (event: any, selected?: Date) => {
    setShowDatePicker(false);
    if (event.type === 'set' && selected) {
      resetSobrietyDate(selected.toISOString().slice(0, 10));
    }
  };

  const sober = lovedOne.sobrietyDate ? daysSince(lovedOne.sobrietyDate) : null;
  const recentMood = checkIns[0];
  const nextMilestone = milestones.find((m) => !m.celebrated);
  const recent = timeline.slice(0, 3);

  const sos = () => {
    Alert.alert(
      'Send SOS?',
      `This immediately alerts your facilitator that you need help right now.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send SOS',
          style: 'destructive',
          onPress: () => {
            if (auth.configured) {
              // notifyCare → member (sender) is excluded, so only facilitators get it.
              notifyCare(lovedOne.id, '🆘 SOS', `${lovedOne.firstName} needs help right now.`);
            } else {
              notifyCareTeam({ title: '🆘 SOS', body: 'Immediate support needed.', audiences: ['facilitator'] });
            }
          },
        },
      ],
    );
  };

  const meetingCheckIn = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      let lat: number | undefined, lng: number | undefined, address: string | undefined;
      if (status === 'granted') {
        const pos = await Location.getCurrentPositionAsync({});
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
        try {
          const geo = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
          const g = geo[0];
          if (g) address = [g.name, g.street, g.city, g.region].filter(Boolean).join(', ');
        } catch {}
      }
      await recordMeetingCheckin(lovedOne.id, lat, lng, address);
      Alert.alert("You're checked in ✅", address ? `Logged at ${address}. Your facilitator can see it.` : 'Your meeting check-in was logged for your facilitator.');
    } catch (e: any) {
      Alert.alert('Could not check in', e?.message ?? 'Please try again.');
    }
  };

  const QUICK_LINKS: { label: string; icon: any; screen: string }[] = [
    { label: 'Tasks', icon: 'checkmark-circle-outline', screen: 'Tasks' },
    { label: 'Community', icon: 'people-outline', screen: 'Community' },
    { label: 'Schedule', icon: 'calendar-outline', screen: 'Schedule' },
    { label: 'Meetings', icon: 'videocam-outline', screen: 'Meetings' },
  ];

  return (
    <Screen>
      {isFacilitator ? (
        <TouchableOpacity onPress={backToClients} style={styles.backToClients} hitSlop={8}>
          <Ionicons name="chevron-back" size={16} color={colors.primary} />
          <Text style={styles.backToClientsText}>All clients</Text>
        </TouchableOpacity>
      ) : null}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <ScreenTitle
            title={`Hi there 👋`}
            subtitle={`Here's how ${lovedOne.firstName} is doing`}
          />
        </View>
        <TouchableOpacity
          onPress={() => nav.navigate('Settings')}
          style={styles.gear}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="settings-outline" size={24} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Hero: recovery summary */}
      <Card style={styles.hero}>
        <Text style={styles.heroName}>{lovedOne.firstName}</Text>
        <Text style={styles.heroProgram}>
          {lovedOne.programName || 'Sober Living'}
        </Text>
        {sober !== null ? (
          <View style={styles.heroStat}>
            <Text style={styles.heroNumber}>{sober}</Text>
            <Text style={styles.heroLabel}>days in recovery</Text>
          </View>
        ) : null}
      </Card>

      {/* Prominent Pay rent button for members */}
      {!isFacilitator ? (
        <TouchableOpacity style={styles.payRent} activeOpacity={0.85} onPress={() => nav.navigate('Payments')}>
          <Ionicons name="card" size={40} color={colors.textInverse} />
          <Text style={styles.payRentText}>Pay rent</Text>
          <Text style={styles.payRentSub}>
            {lovedOne.monthlyRentCents
              ? `$${(lovedOne.monthlyRentCents / 100).toFixed(0)}/mo${lovedOne.rentDueDay ? ` · due the ${lovedOne.rentDueDay}` : ''} · tap to pay`
              : 'Card, CashApp, or Zelle · tap to pay'}
          </Text>
        </TouchableOpacity>
      ) : null}

      {/* Meeting check-in — records location so no signed cards needed */}
      {!isFacilitator ? (
        <TouchableOpacity style={styles.meetingBtn} activeOpacity={0.85} onPress={meetingCheckIn}>
          <Ionicons name="location" size={36} color={colors.textInverse} />
          <Text style={styles.meetingText}>I'm at a meeting</Text>
          <Text style={styles.meetingSub}>Check in — records your location</Text>
        </TouchableOpacity>
      ) : null}

      {/* Quick links */}
      <View style={styles.quickRow}>
        {QUICK_LINKS.map((q) => (
          <TouchableOpacity
            key={q.screen}
            style={styles.quick}
            onPress={() => nav.navigate(q.screen)}
            activeOpacity={0.7}
          >
            <Ionicons name={q.icon} size={24} color={colors.primary} />
            <Text style={styles.quickLabel}>{q.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* SOS */}
      <TouchableOpacity style={styles.sos} onPress={sos} activeOpacity={0.85}>
        <Text style={styles.sosText}>🆘  Send SOS — alert my facilitator now</Text>
      </TouchableOpacity>

      {/* Flag a message for the facilitator */}
      {!isFacilitator ? (
        <TouchableOpacity style={styles.flagBtn} onPress={() => setAlertOpen(true)} activeOpacity={0.8}>
          <Ionicons name="flag-outline" size={18} color={colors.primary} />
          <Text style={styles.flagText}>Message my facilitator</Text>
        </TouchableOpacity>
      ) : null}

      <Modal visible={alertOpen} transparent animationType="fade" onRequestClose={() => setAlertOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={typography.h3}>Message your facilitator</Text>
            <Text style={[typography.caption, { marginBottom: spacing.sm }]}>Only your facilitator will see this.</Text>
            <TextInput
              style={styles.modalInput}
              value={alertText}
              onChangeText={setAlertText}
              placeholder="What's going on?"
              placeholderTextColor={colors.textMuted}
              multiline
            />
            <Button title="Send" onPress={sendAlert} disabled={!alertText.trim()} />
            <TouchableOpacity onPress={() => setAlertOpen(false)} style={{ alignItems: 'center', paddingVertical: spacing.sm }}>
              <Text style={{ color: colors.textSecondary }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Latest check-in */}
      <SectionTitle>Latest check-in</SectionTitle>
      <Card>
        {recentMood ? (
          <View style={styles.moodRow}>
            <Text style={styles.moodEmoji}>{MOOD_EMOJI[recentMood.mood]}</Text>
            <View style={{ flex: 1 }}>
              <Text style={typography.h3}>{MOOD_LABELS[recentMood.mood]}</Text>
              <Text style={typography.caption}>{formatDate(recentMood.date)}</Text>
              {recentMood.note ? (
                <Text style={[typography.bodySecondary, { marginTop: 4 }]}>
                  {recentMood.note}
                </Text>
              ) : null}
            </View>
          </View>
        ) : (
          <Text style={typography.bodySecondary}>No check-ins yet.</Text>
        )}
      </Card>

      {/* Next milestone */}
      {nextMilestone ? (
        <>
          <SectionTitle>Coming up</SectionTitle>
          <Card style={styles.milestoneCard}>
            <Text style={styles.milestoneTitle}>🎉 {nextMilestone.title}</Text>
            {nextMilestone.description ? (
              <Text style={typography.bodySecondary}>{nextMilestone.description}</Text>
            ) : null}
          </Card>
        </>
      ) : null}

      {/* Recent activity preview */}
      <SectionTitle>Recent activity</SectionTitle>
      {recent.length === 0 ? (
        <Card>
          <Text style={typography.bodySecondary}>
            No activity yet. Add your first check-in to start building {lovedOne.firstName}'s
            timeline.
          </Text>
        </Card>
      ) : null}
      {recent.map((entry) => (
        <Card key={entry.id} style={styles.activityRow}>
          <View style={styles.dot} />
          <View style={{ flex: 1 }}>
            <Text style={typography.body}>{describeEntry(entry)}</Text>
            <Text style={typography.caption}>{formatDate(entry.date)}</Text>
          </View>
        </Card>
      ))}

      {/* Quick actions */}
      <View style={{ height: spacing.sm }} />
      <Button title="Check in on today" onPress={() => nav.navigate('Progress')} />
      <View style={{ height: spacing.sm }} />
      <Button
        title="Ask Companion a question"
        variant="secondary"
        onPress={() => nav.navigate('Assistant')}
      />

      {/* Sobriety date — tap to set/change via a calendar */}
      <SectionTitle>Sobriety date</SectionTitle>
      <Card onPress={() => setShowDatePicker(true)}>
        <View style={styles.sobrietyRow}>
          <View style={{ flex: 1 }}>
            <Text style={typography.h3}>
              {lovedOne.sobrietyDate ? formatDate(lovedOne.sobrietyDate) : 'Tap to set'}
            </Text>
            {lovedOne.sobrietyDate ? (
              <Text style={typography.caption}>{sober ?? 0} days · tap to change</Text>
            ) : (
              <Text style={typography.caption}>Set the date you want to count from</Text>
            )}
          </View>
          <Ionicons name="calendar-outline" size={24} color={colors.primary} />
        </View>
      </Card>
      {showDatePicker ? (
        <DateTimePicker
          value={lovedOne.sobrietyDate ? new Date(lovedOne.sobrietyDate) : new Date()}
          mode="date"
          maximumDate={new Date()}
          onChange={onSobrietyDate}
        />
      ) : null}
    </Screen>
  );
}

function describeEntry(entry: TimelineEntry): string {
  switch (entry.kind) {
    case 'check-in':
      return `Check-in: ${MOOD_LABELS[(entry.data as CheckIn).mood]}`;
    case 'milestone':
      return `Milestone: ${(entry.data as Milestone).title}`;
    case 'session':
      return (entry.data as TreatmentSession).attended
        ? 'Attended a session'
        : 'Missed a session';
    default:
      return 'Update';
  }
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start' },
  gear: { paddingTop: spacing.md + 4, paddingLeft: spacing.sm },
  backToClients: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.xs, marginBottom: spacing.xs },
  backToClientsText: { color: colors.primary, fontWeight: '600', fontSize: 14 },
  payRent: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    paddingVertical: spacing.xl + spacing.sm,
    marginBottom: spacing.md,
    ...shadow.card,
  },
  payRentText: { color: colors.textInverse, fontWeight: '800', fontSize: 26, marginTop: spacing.xs },
  payRentSub: { color: colors.textInverse, opacity: 0.9, fontSize: 13, marginTop: 2 },
  meetingBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: spacing.xl + spacing.sm,
    marginBottom: spacing.md,
    ...shadow.card,
  },
  meetingText: { color: colors.textInverse, fontWeight: '800', fontSize: 26, marginTop: spacing.xs },
  meetingSub: { color: colors.textInverse, opacity: 0.9, fontSize: 13, marginTop: 2 },
  quickRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.md },
  quick: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginHorizontal: 3,
    ...shadow.card,
  },
  quickLabel: { fontSize: 11, color: colors.textSecondary, marginTop: 4, fontWeight: '600' },
  sos: {
    backgroundColor: colors.crisisBg,
    borderColor: colors.crisis,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sosText: { color: colors.crisis, fontWeight: '700', fontSize: 14 },
  flagBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.sm, marginBottom: spacing.md },
  flagText: { color: colors.primary, fontWeight: '600', marginLeft: spacing.xs },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: spacing.lg },
  modalCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md },
  modalInput: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, minHeight: 80, textAlignVertical: 'top', fontSize: 15, color: colors.textPrimary, marginBottom: spacing.md },
  sobrietyRow: { flexDirection: 'row', alignItems: 'center' },
  hero: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
  },
  heroName: { fontSize: 24, fontWeight: '700', color: colors.textInverse },
  heroProgram: { fontSize: 14, color: colors.primaryLight, marginTop: 2 },
  heroStat: { flexDirection: 'row', alignItems: 'baseline', marginTop: spacing.md },
  heroNumber: { fontSize: 40, fontWeight: '800', color: colors.textInverse },
  heroLabel: { fontSize: 15, color: colors.primaryLight, marginLeft: spacing.sm },
  moodRow: { flexDirection: 'row', alignItems: 'center' },
  moodEmoji: { fontSize: 40, marginRight: spacing.md },
  milestoneCard: { backgroundColor: colors.accentLight },
  milestoneTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: 2 },
  activityRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm + 2 },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
    marginRight: spacing.md,
  },
});
