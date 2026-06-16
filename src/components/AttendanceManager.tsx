import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Switch, Alert } from 'react-native';
import { Card, SectionTitle, Button } from './ui';
import { colors, spacing, radius, typography } from '../theme';
import { DateField } from './PickerFields';
import { listMeetingAttendance, addMeetingAttendance, deleteMeetingAttendance, MeetingAttendance } from '../services/db';
import { formatDate } from '../utils/format';

/** Staff: record and review a member's meeting attendance (AA/NA, house meeting,
 *  group, etc.) with a note — handy for court/probation reporting. */
export function AttendanceManager({ individualId, memberName }: { individualId: string; memberName?: string }) {
  const [records, setRecords] = useState<MeetingAttendance[]>([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [attended, setAttended] = useState(true);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => listMeetingAttendance(individualId).then(setRecords).catch(() => {});
  useEffect(() => { load(); }, [individualId]);

  const save = async () => {
    if (!name.trim() || !date) { Alert.alert('Missing info', 'Add a meeting name and date.'); return; }
    setBusy(true);
    try {
      await addMeetingAttendance({ individualId, meetingName: name.trim(), meetingDate: date, attended, note: note.trim() || undefined });
      setName(''); setDate(''); setAttended(true); setNote(''); setAdding(false);
      load();
    } catch (e: any) { Alert.alert('Could not save', e?.message ?? 'Try again.'); }
    finally { setBusy(false); }
  };

  const remove = (r: MeetingAttendance) => {
    Alert.alert('Delete record?', `Remove “${r.meetingName}” on ${formatDate(r.meetingDate)}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await deleteMeetingAttendance(r.id).catch(() => {}); load(); } },
    ]);
  };

  return (
    <>
      <SectionTitle>Meeting attendance</SectionTitle>
      <Card>
        <Text style={[typography.caption, { marginBottom: spacing.sm }]}>
          Log meetings {memberName || 'this member'} attended (or missed) with a note — useful for reporting.
        </Text>

        {records.length === 0 ? (
          <Text style={typography.bodySecondary}>No attendance recorded yet.</Text>
        ) : (
          records.map((r) => (
            <TouchableOpacity key={r.id} style={styles.row} onLongPress={() => remove(r)}>
              <Text style={styles.mark}>{r.attended ? '✅' : '❌'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={typography.body}>{r.meetingName}</Text>
                <Text style={typography.caption}>{formatDate(r.meetingDate)}{r.note ? ` · ${r.note}` : ''}</Text>
              </View>
            </TouchableOpacity>
          ))
        )}

        <View style={{ height: spacing.sm }} />
        {adding ? (
          <View>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Meeting (e.g. AA — Tuesday Nooners)" placeholderTextColor={colors.textMuted} />
            <Text style={[typography.caption, { marginBottom: spacing.xs }]}>Date</Text>
            <DateField value={date} onChange={setDate} placeholder="Pick the meeting date" />
            <View style={styles.switchRow}>
              <Text style={typography.body}>{attended ? 'Attended' : 'Did not attend'}</Text>
              <Switch value={attended} onValueChange={setAttended} trackColor={{ true: colors.success }} />
            </View>
            <TextInput style={styles.input} value={note} onChangeText={setNote} placeholder="Note (optional)" placeholderTextColor={colors.textMuted} />
            <Button title={busy ? 'Saving…' : 'Save record'} onPress={save} disabled={busy} />
            <TouchableOpacity onPress={() => setAdding(false)} style={{ alignItems: 'center', paddingVertical: spacing.sm }}><Text style={{ color: colors.textSecondary }}>Cancel</Text></TouchableOpacity>
          </View>
        ) : (
          <Button title="➕ Log attendance" variant="secondary" onPress={() => setAdding(true)} />
        )}
        {records.length ? <Text style={[typography.caption, { color: colors.textMuted, marginTop: 4 }]}>Long-press a record to delete it.</Text> : null}
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider },
  mark: { fontSize: 18, marginRight: spacing.sm },
  input: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, fontSize: 15, color: colors.textPrimary, marginVertical: spacing.sm },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
});
