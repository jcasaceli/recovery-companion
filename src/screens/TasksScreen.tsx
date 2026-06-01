import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { Screen, ScreenTitle, Card, SectionTitle, Button } from '../components/ui';
import { colors, spacing, radius, typography } from '../theme';
import { useAppState } from '../state/store';
import { TaskRecurrence } from '../types';
import { describeAudience } from '../services/push';
import { formatDateTime } from '../utils/format';

// Tasks & notes always notify the whole care team in this app.
const NOTIFY_TEXT = describeAudience(['facilitator', 'individual', 'supporters']);

const RECURRENCES: { value: TaskRecurrence; label: string }[] = [
  { value: 'none', label: 'One-time' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
];

export function TasksScreen() {
  const { tasks, notes, addTask, toggleTask, addNote, lovedOne } = useAppState();
  const [taskTitle, setTaskTitle] = useState('');
  const [recurrence, setRecurrence] = useState<TaskRecurrence>('none');
  const [noteBody, setNoteBody] = useState('');

  const submitTask = () => {
    if (!taskTitle.trim()) return;
    addTask({ title: taskTitle, recurrence });
    setTaskTitle('');
    setRecurrence('none');
  };

  const submitNote = () => {
    if (!noteBody.trim()) return;
    addNote(noteBody, 'all');
    setNoteBody('');
  };

  return (
    <Screen>
      <ScreenTitle title="Tasks & notes" subtitle={`Shared with ${lovedOne.firstName}'s care team`} />

      {/* Add task */}
      <Card>
        <SectionTitle>Add a task or reminder</SectionTitle>
        <TextInput
          style={styles.input}
          placeholder="e.g. Attend a 7pm NA meeting"
          placeholderTextColor={colors.textMuted}
          value={taskTitle}
          onChangeText={setTaskTitle}
        />
        <View style={styles.chips}>
          {RECURRENCES.map((r) => (
            <TouchableOpacity
              key={r.value}
              onPress={() => setRecurrence(r.value)}
              style={[styles.chip, recurrence === r.value ? styles.chipActive : null]}
            >
              <Text style={[styles.chipText, recurrence === r.value ? styles.chipTextActive : null]}>
                {r.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.notifyBanner}>
          <Text style={styles.notifyText}>🔔 This will notify {NOTIFY_TEXT}.</Text>
        </View>
        <Button title="Add task" onPress={submitTask} disabled={!taskTitle.trim()} />
      </Card>

      {/* Task list */}
      <SectionTitle>Tasks</SectionTitle>
      {tasks.length === 0 ? (
        <Card><Text style={typography.bodySecondary}>No tasks yet.</Text></Card>
      ) : (
        tasks.map((t) => (
          <Card key={t.id} style={styles.taskRow} onPress={() => toggleTask(t.id)}>
            <Text style={styles.check}>{t.completed ? '☑️' : '⬜️'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.taskTitle, t.completed ? styles.done : null]}>{t.title}</Text>
              <Text style={typography.caption}>
                {t.recurrence !== 'none' ? `${cap(t.recurrence)} · ` : ''}From {t.createdByName}
              </Text>
            </View>
          </Card>
        ))
      )}

      {/* Add note */}
      <Card style={{ marginTop: spacing.md }}>
        <SectionTitle>Add a note</SectionTitle>
        <TextInput
          style={[styles.input, { minHeight: 70, textAlignVertical: 'top' }]}
          placeholder="Share an update or observation…"
          placeholderTextColor={colors.textMuted}
          value={noteBody}
          onChangeText={setNoteBody}
          multiline
        />
        <View style={styles.notifyBanner}>
          <Text style={styles.notifyText}>🔔 This will notify {NOTIFY_TEXT}.</Text>
        </View>
        <Button title="Add note" onPress={submitNote} disabled={!noteBody.trim()} />
      </Card>

      {/* Notes list */}
      <SectionTitle>Notes</SectionTitle>
      {notes.length === 0 ? (
        <Card><Text style={typography.bodySecondary}>No notes yet.</Text></Card>
      ) : (
        notes.map((n) => (
          <Card key={n.id}>
            <Text style={typography.body}>{n.body}</Text>
            <Text style={[typography.caption, { marginTop: 6 }]}>
              {n.authorName} · {formatDateTime(n.createdAt)}
            </Text>
          </Card>
        ))
      )}
    </Screen>
  );
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 15,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  chips: { flexDirection: 'row', marginBottom: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    marginRight: spacing.sm,
  },
  chipActive: { backgroundColor: colors.primary },
  chipText: { fontSize: 13, color: colors.textSecondary },
  chipTextActive: { color: colors.textInverse, fontWeight: '600' },
  notifyBanner: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.md,
    padding: spacing.sm + 2,
    marginBottom: spacing.md,
  },
  notifyText: { fontSize: 13, color: colors.primaryDark },
  taskRow: { flexDirection: 'row', alignItems: 'center' },
  check: { fontSize: 22, marginRight: spacing.sm },
  taskTitle: { ...typography.body, fontWeight: '500' },
  done: { textDecorationLine: 'line-through', color: colors.textMuted },
});
