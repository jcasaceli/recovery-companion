import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Screen, ScreenTitle, Card, SectionTitle, Button } from '../components/ui';
import { notifyCareTeam } from '../services/push';
import { colors, spacing, radius, typography, shadow } from '../theme';
import { useAppState } from '../state/store';
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
  const { lovedOne, checkIns, milestones, timeline } = useAppState();

  const sober = lovedOne.sobrietyDate ? daysSince(lovedOne.sobrietyDate) : null;
  const recentMood = checkIns[0];
  const nextMilestone = milestones.find((m) => !m.celebrated);
  const recent = timeline.slice(0, 3);

  const sos = () => {
    Alert.alert(
      'Send SOS?',
      `This immediately alerts ${lovedOne.firstName}'s facilitator and family supporters that you need help right now.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send SOS',
          style: 'destructive',
          onPress: () =>
            notifyCareTeam({
              title: '🆘 SOS',
              body: `${lovedOne.firstName}'s circle needs immediate support.`,
              audiences: ['facilitator', 'supporters', 'individual'],
            }),
        },
      ],
    );
  };

  const QUICK_LINKS: { label: string; icon: any; screen: string }[] = [
    { label: 'Tasks', icon: 'checkmark-circle-outline', screen: 'Tasks' },
    { label: 'Community', icon: 'people-outline', screen: 'Community' },
    { label: 'Schedule', icon: 'calendar-outline', screen: 'Schedule' },
    { label: 'Meetings', icon: 'videocam-outline', screen: 'Meetings' },
  ];

  return (
    <Screen>
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
          {PROGRAM_LABELS[lovedOne.programType]} · {lovedOne.programName}
        </Text>
        {sober !== null ? (
          <View style={styles.heroStat}>
            <Text style={styles.heroNumber}>{sober}</Text>
            <Text style={styles.heroLabel}>days in recovery</Text>
          </View>
        ) : null}
      </Card>

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
        <Text style={styles.sosText}>🆘  Send SOS — alert my support circle now</Text>
      </TouchableOpacity>

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
