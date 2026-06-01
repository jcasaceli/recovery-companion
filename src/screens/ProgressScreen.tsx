import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { Screen, ScreenTitle, Card, SectionTitle, Button } from '../components/ui';
import { colors, spacing, radius, typography } from '../theme';
import { useAppState } from '../state/store';
import {
  CheckIn,
  Milestone,
  TreatmentSession,
  TimelineEntry,
  MoodLevel,
} from '../types';
import {
  formatDate,
  MOOD_EMOJI,
  MOOD_LABELS,
  SESSION_LABELS,
} from '../utils/format';

const MOODS: MoodLevel[] = [1, 2, 3, 4, 5];
const MOOD_COLORS: Record<MoodLevel, string> = {
  1: colors.mood1,
  2: colors.mood2,
  3: colors.mood3,
  4: colors.mood4,
  5: colors.mood5,
};

export function ProgressScreen() {
  const { lovedOne, timeline, addCheckIn, toggleCelebrate } = useAppState();
  const [open, setOpen] = useState(false);
  const [mood, setMood] = useState<MoodLevel | null>(null);
  const [note, setNote] = useState('');

  const submit = () => {
    if (!mood) return;
    addCheckIn(mood, note, []);
    setMood(null);
    setNote('');
    setOpen(false);
  };

  return (
    <Screen>
      <ScreenTitle title="Progress" subtitle={`${lovedOne.firstName}'s journey`} />

      {/* Check-in flow */}
      {!open ? (
        <Button title="+ New check-in" onPress={() => setOpen(true)} />
      ) : (
        <Card>
          <SectionTitle>How is {lovedOne.firstName} doing today?</SectionTitle>
          <View style={styles.moodRow}>
            {MOODS.map((m) => (
              <TouchableOpacity
                key={m}
                onPress={() => setMood(m)}
                style={[
                  styles.moodOption,
                  mood === m ? { borderColor: MOOD_COLORS[m], borderWidth: 2 } : null,
                ]}
              >
                <Text style={styles.moodOptionEmoji}>{MOOD_EMOJI[m]}</Text>
                <Text style={styles.moodOptionLabel}>{MOOD_LABELS[m]}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            placeholder="Add a note (optional)"
            placeholderTextColor={colors.textMuted}
            value={note}
            onChangeText={setNote}
            multiline
            style={styles.input}
          />
          <View style={styles.formButtons}>
            <View style={{ flex: 1 }}>
              <Button title="Save check-in" onPress={submit} disabled={!mood} />
            </View>
          </View>
          <TouchableOpacity onPress={() => setOpen(false)} style={styles.cancel}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </Card>
      )}

      {/* Timeline */}
      <SectionTitle>Timeline</SectionTitle>
      {timeline.length === 0 ? (
        <Card>
          <Text style={typography.bodySecondary}>
            Nothing here yet. Your check-ins, milestones, and sessions will appear
            in this timeline as you add them.
          </Text>
        </Card>
      ) : null}
      {timeline.map((entry) => (
        <TimelineCard key={entry.id} entry={entry} onCelebrate={toggleCelebrate} />
      ))}
    </Screen>
  );
}

function TimelineCard({
  entry,
  onCelebrate,
}: {
  entry: TimelineEntry;
  onCelebrate: (id: string) => void;
}) {
  if (entry.kind === 'check-in') {
    const c = entry.data as CheckIn;
    return (
      <Card style={styles.timelineCard}>
        <Text style={styles.timelineEmoji}>{MOOD_EMOJI[c.mood]}</Text>
        <View style={{ flex: 1 }}>
          <Text style={typography.h3}>{MOOD_LABELS[c.mood]}</Text>
          <Text style={typography.caption}>{formatDate(c.date)} · Check-in</Text>
          {c.note ? (
            <Text style={[typography.bodySecondary, { marginTop: 4 }]}>{c.note}</Text>
          ) : null}
        </View>
      </Card>
    );
  }

  if (entry.kind === 'milestone') {
    const m = entry.data as Milestone;
    return (
      <Card style={[styles.timelineCard, { backgroundColor: colors.accentLight }]}>
        <Text style={styles.timelineEmoji}>🎉</Text>
        <View style={{ flex: 1 }}>
          <Text style={typography.h3}>{m.title}</Text>
          <Text style={typography.caption}>{formatDate(m.date)} · Milestone</Text>
          {m.description ? (
            <Text style={[typography.bodySecondary, { marginTop: 4 }]}>{m.description}</Text>
          ) : null}
        </View>
        <TouchableOpacity onPress={() => onCelebrate(m.id)}>
          <Text style={{ fontSize: 22 }}>{m.celebrated ? '❤️' : '🤍'}</Text>
        </TouchableOpacity>
      </Card>
    );
  }

  // session
  const s = entry.data as TreatmentSession;
  return (
    <Card style={styles.timelineCard}>
      <Text style={styles.timelineEmoji}>{s.attended ? '✅' : '⚠️'}</Text>
      <View style={{ flex: 1 }}>
        <Text style={typography.h3}>{SESSION_LABELS[s.type]}</Text>
        <Text style={typography.caption}>
          {formatDate(s.date)} · {s.attended ? 'Attended' : 'Missed'}
        </Text>
        {s.note ? (
          <Text style={[typography.bodySecondary, { marginTop: 4 }]}>{s.note}</Text>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  moodRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.md },
  moodOption: {
    alignItems: 'center',
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: 'transparent',
    width: 62,
  },
  moodOptionEmoji: { fontSize: 26 },
  moodOptionLabel: { fontSize: 10, color: colors.textSecondary, marginTop: 2 },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 64,
    textAlignVertical: 'top',
    fontSize: 15,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  formButtons: { flexDirection: 'row' },
  cancel: { alignItems: 'center', paddingVertical: spacing.sm, marginTop: spacing.xs },
  cancelText: { color: colors.textSecondary, fontSize: 15 },
  timelineCard: { flexDirection: 'row', alignItems: 'flex-start' },
  timelineEmoji: { fontSize: 28, marginRight: spacing.md },
});
