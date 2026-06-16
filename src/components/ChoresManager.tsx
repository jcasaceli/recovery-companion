import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert } from 'react-native';
import { Card, SectionTitle, Button } from './ui';
import { colors, spacing, radius, typography } from '../theme';
import { DateField } from './PickerFields';
import { listTasks, addTask, setTaskCompleted, deleteTask } from '../services/db';
import { Task, TaskRecurrence } from '../types';
import { formatDate } from '../utils/format';

const RECUR: { value: TaskRecurrence; label: string }[] = [
  { value: 'none', label: 'One-time' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
];

/** Staff: assign chores & tasks to a member. They appear in the member's Tasks
 *  tab where they check them off; staff see completion here. */
export function ChoresManager({ individualId, memberName }: { individualId: string; memberName?: string }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [recurrence, setRecurrence] = useState<TaskRecurrence>('weekly');
  const [dueDate, setDueDate] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => listTasks(individualId).then(setTasks).catch(() => {});
  useEffect(() => { load(); }, [individualId]);

  const save = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      await addTask(individualId, { title: title.trim(), recurrence, dueDate: dueDate || undefined });
      setTitle(''); setDueDate(''); setRecurrence('weekly'); setAdding(false);
      load();
    } catch (e: any) { Alert.alert('Could not add', e?.message ?? 'Try again.'); }
    finally { setBusy(false); }
  };

  const toggle = async (t: Task) => {
    setTasks((arr) => arr.map((x) => x.id === t.id ? { ...x, completed: !x.completed } : x));
    try { await setTaskCompleted(t.id, !t.completed); } catch { load(); }
  };

  const remove = (t: Task) => {
    Alert.alert('Delete chore?', `Remove “${t.title}”?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await deleteTask(t.id).catch(() => {}); load(); } },
    ]);
  };

  const recurLabel = (r: TaskRecurrence) => (r === 'none' ? '' : r === 'daily' ? 'Daily' : 'Weekly');

  return (
    <>
      <SectionTitle>Chores &amp; tasks</SectionTitle>
      <Card>
        <Text style={[typography.caption, { marginBottom: spacing.sm }]}>
          Assign chores to {memberName || 'this member'}. They’ll see and check them off in their Tasks tab.
        </Text>

        {tasks.length === 0 ? (
          <Text style={typography.bodySecondary}>No chores assigned yet.</Text>
        ) : (
          tasks.map((t) => (
            <TouchableOpacity key={t.id} style={styles.row} onPress={() => toggle(t)} onLongPress={() => remove(t)}>
              <Text style={styles.check}>{t.completed ? '☑️' : '⬜️'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[typography.body, t.completed ? styles.done : null]}>{t.title}</Text>
                <Text style={typography.caption}>
                  {[recurLabel(t.recurrence), t.dueDate ? `Due ${formatDate(t.dueDate)}` : ''].filter(Boolean).join(' · ') || 'One-time'}
                </Text>
              </View>
            </TouchableOpacity>
          ))
        )}

        <View style={{ height: spacing.sm }} />
        {adding ? (
          <View>
            <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Chore (e.g. Kitchen clean-up)" placeholderTextColor={colors.textMuted} />
            <View style={styles.chips}>
              {RECUR.map((r) => (
                <TouchableOpacity key={r.value} style={[styles.chip, recurrence === r.value && styles.chipOn]} onPress={() => setRecurrence(r.value)}>
                  <Text style={[styles.chipText, recurrence === r.value && { color: colors.textInverse }]}>{r.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[typography.caption, { marginTop: spacing.sm, marginBottom: spacing.xs }]}>Due date (optional)</Text>
            <DateField value={dueDate} onChange={setDueDate} placeholder="Pick a date" />
            <View style={{ height: spacing.sm }} />
            <Button title={busy ? 'Adding…' : 'Add chore'} onPress={save} disabled={busy || !title.trim()} />
            <TouchableOpacity onPress={() => setAdding(false)} style={{ alignItems: 'center', paddingVertical: spacing.sm }}><Text style={{ color: colors.textSecondary }}>Cancel</Text></TouchableOpacity>
          </View>
        ) : (
          <Button title="➕ Assign a chore" variant="secondary" onPress={() => setAdding(true)} />
        )}
        {tasks.length ? <Text style={[typography.caption, { color: colors.textMuted, marginTop: 4 }]}>Long-press a chore to delete it.</Text> : null}
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider },
  check: { fontSize: 22, marginRight: spacing.sm },
  done: { textDecorationLine: 'line-through', color: colors.textMuted },
  input: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, fontSize: 15, color: colors.textPrimary, marginBottom: spacing.sm },
  chips: { flexDirection: 'row' },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, marginRight: spacing.sm, borderWidth: 1, borderColor: colors.border },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
});
