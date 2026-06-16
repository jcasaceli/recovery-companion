import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Screen, ScreenTitle, Card, SectionTitle, Button, Pill } from '../components/ui';
import { colors, spacing, radius, typography } from '../theme';
import { DateField, TimeField } from '../components/PickerFields';
import { getPassesEnabled, submitPass, listMyPasses, cancelPass, Pass, PassType } from '../services/db';
import { notifyCare } from '../services/push';
import { formatDate, to12h } from '../utils/format';

const STATUS: Record<Pass['status'], { label: string; color: string }> = {
  pending: { label: 'Pending review', color: colors.warning },
  approved: { label: 'Approved', color: colors.success },
  denied: { label: 'Denied', color: colors.crisis },
};

export function PassesScreen() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [passes, setPasses] = useState<Pass[]>([]);
  const [loading, setLoading] = useState(true);

  const [type, setType] = useState<PassType>('overnight');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [returnTime, setReturnTime] = useState('');
  const [destination, setDestination] = useState('');
  const [reason, setReason] = useState('');
  const [contact, setContact] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([getPassesEnabled(), listMyPasses()])
      .then(([en, mine]) => { setEnabled(en); setPasses(mine); })
      .catch(() => setEnabled(false))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const reset = () => {
    setStartDate(''); setEndDate(''); setReturnTime(''); setDestination(''); setReason(''); setContact('');
  };

  const submit = async () => {
    if (!startDate) { Alert.alert('Pick a date', 'Please choose the date of your pass.'); return; }
    const end = type === 'overnight' ? startDate : (endDate || startDate);
    if (type === 'multi_day' && end < startDate) {
      Alert.alert('Check the dates', 'The end date can’t be before the start date.');
      return;
    }
    setBusy(true);
    try {
      const res = await submitPass({
        type, startDate, endDate: end, returnTime: returnTime || undefined,
        destination: destination.trim() || undefined, reason: reason.trim() || undefined,
        contactPhone: contact.trim() || undefined,
      });
      const kind = type === 'overnight' ? 'an overnight' : 'a multi-day';
      notifyCare(res.individualId, 'New pass request', `${res.firstName || 'A member'} requested ${kind} pass for ${formatDate(startDate)}.`, 'alert');
      reset();
      Alert.alert('Request sent', 'Your facilitator and house manager have been notified. You’ll see the decision here.');
      load();
    } catch (e: any) {
      Alert.alert('Could not submit', e?.message ?? 'Please try again.');
    } finally { setBusy(false); }
  };

  const remove = (p: Pass) => {
    Alert.alert('Cancel this request?', 'This will withdraw your pass request.', [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Cancel request', style: 'destructive', onPress: async () => { await cancelPass(p.id).catch(() => {}); load(); } },
    ]);
  };

  const whenLine = (p: Pass) =>
    p.type === 'overnight'
      ? `Overnight · ${formatDate(p.startDate)}${p.returnTime ? ` · back by ${to12h(p.returnTime)}` : ''}`
      : `${formatDate(p.startDate)} → ${formatDate(p.endDate)}${p.returnTime ? ` · back by ${to12h(p.returnTime)}` : ''}`;

  if (loading) {
    return <Screen><ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} /></Screen>;
  }

  if (enabled === false) {
    return (
      <Screen>
        <ScreenTitle title="Passes" subtitle="Overnight & multi-day requests" />
        <Card>
          <Text style={typography.bodySecondary}>
            Pass requests aren’t enabled for your sober living right now. Ask your facilitator or house
            manager to turn them on.
          </Text>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenTitle title="Passes" subtitle="Request an overnight or multi-day pass" />

      <Card>
        <SectionTitle>New request</SectionTitle>
        <View style={styles.typeRow}>
          {(['overnight', 'multi_day'] as PassType[]).map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.typeChip, type === t && styles.typeChipOn]}
              onPress={() => setType(t)}
            >
              <Text style={[styles.typeChipText, type === t && { color: colors.textInverse }]}>
                {t === 'overnight' ? 'Overnight' : 'Multi-day'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>{type === 'overnight' ? 'Night of' : 'From'}</Text>
        <DateField value={startDate} onChange={setStartDate} placeholder="Pick a date" />

        {type === 'multi_day' ? (
          <>
            <Text style={styles.label}>To</Text>
            <DateField value={endDate} onChange={setEndDate} placeholder="Pick a date" />
          </>
        ) : null}

        <Text style={styles.label}>Expected return time</Text>
        <TimeField value={returnTime} onChange={setReturnTime} placeholder="Pick a time (optional)" />

        <Text style={styles.label}>Where will you be?</Text>
        <TextInput style={styles.input} value={destination} onChangeText={setDestination} placeholder="Destination (e.g. parents’ house)" placeholderTextColor={colors.textMuted} />

        <Text style={styles.label}>Reason</Text>
        <TextInput style={styles.input} value={reason} onChangeText={setReason} placeholder="Reason for the pass" placeholderTextColor={colors.textMuted} />

        <Text style={styles.label}>Contact phone while out</Text>
        <TextInput style={styles.input} value={contact} onChangeText={setContact} placeholder="(555) 123-4567" placeholderTextColor={colors.textMuted} keyboardType="phone-pad" />

        <View style={{ height: spacing.sm }} />
        <Button title={busy ? 'Sending…' : 'Submit request'} onPress={submit} disabled={busy || !startDate} />
      </Card>

      <SectionTitle>My requests</SectionTitle>
      {passes.length === 0 ? (
        <Card><Text style={typography.bodySecondary}>You haven’t requested any passes yet.</Text></Card>
      ) : (
        passes.map((p) => {
          const s = STATUS[p.status];
          return (
            <Card key={p.id}>
              <View style={styles.passHead}>
                <Text style={[typography.h3, { flex: 1 }]}>{whenLine(p)}</Text>
                <Pill label={s.label} color={s.color} />
              </View>
              {p.destination ? <Text style={typography.caption}>📍 {p.destination}</Text> : null}
              {p.reason ? <Text style={typography.caption}>📝 {p.reason}</Text> : null}
              {p.status === 'denied' && p.reviewNote ? (
                <Text style={[typography.caption, { color: colors.crisis }]}>Note: {p.reviewNote}</Text>
              ) : null}
              {p.status === 'pending' ? (
                <TouchableOpacity onPress={() => remove(p)} style={{ marginTop: spacing.sm }}>
                  <Text style={{ color: colors.crisis, fontWeight: '600' }}>Cancel request</Text>
                </TouchableOpacity>
              ) : null}
            </Card>
          );
        })
      )}
      <View style={{ height: spacing.xl }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  typeRow: { flexDirection: 'row', marginBottom: spacing.sm },
  typeChip: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, marginRight: spacing.sm, borderWidth: 1, borderColor: colors.border },
  typeChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  typeChipText: { fontWeight: '700', color: colors.textSecondary },
  label: { ...typography.bodySecondary, fontWeight: '600', marginTop: spacing.sm, marginBottom: spacing.xs },
  input: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, fontSize: 15, color: colors.textPrimary },
  passHead: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xs },
});
