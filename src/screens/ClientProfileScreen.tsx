import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, Alert, Linking, Platform } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { Screen, ScreenTitle, Card, SectionTitle, Button } from '../components/ui';
import { colors, spacing, radius, typography } from '../theme';
import { useAppState } from '../state/store';
import { listMeetingCheckins, getMyOrg } from '../services/db';
import { formatDateTime } from '../utils/format';

export function ClientProfileScreen() {
  const route = useRoute<any>();
  const { id } = route.params;
  const { clients, setRent, setClientStatus, selectClient } = useAppState();
  const client = clients.find((c) => c.id === id);

  const [amount, setAmount] = useState(client?.monthlyRentCents ? (client.monthlyRentCents / 100).toFixed(2) : '');
  const [dueDay, setDueDay] = useState(client?.rentDueDay ? String(client.rentDueDay) : '');
  const [checkins, setCheckins] = useState<any[]>([]);
  const [showMeetings, setShowMeetings] = useState(false);
  const [org, setOrg] = useState<{ name?: string; join_code?: string } | null>(null);

  useEffect(() => {
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    listMeetingCheckins(id, weekAgo).then(setCheckins).catch(() => {});
    getMyOrg().then((o: any) => o && setOrg({ name: o.name, join_code: o.join_code })).catch(() => {});
  }, [id]);

  const textInvite = () => {
    if (!client?.phone) return;
    const code = org?.join_code ? ` Use join code ${org.join_code}.` : '';
    const msg = `Hi ${client.firstName}, join ${org?.name || 'our sober living'} on the Recovery Companion app to track your progress and pay rent.${code}`;
    const sep = Platform.OS === 'ios' ? '&' : '?';
    Linking.openURL(`sms:${client.phone}${sep}body=${encodeURIComponent(msg)}`).catch(() =>
      Alert.alert('Could not open Messages', 'Try texting them the join code manually.'),
    );
  };

  if (!client) {
    return <Screen><Text style={typography.body}>Client not found.</Text></Screen>;
  }

  const saveRent = async () => {
    const cents = amount ? Math.round(parseFloat(amount) * 100) : null;
    const day = dueDay ? Math.min(31, Math.max(1, parseInt(dueDay, 10))) : null;
    try {
      await setRent(id, cents, day);
      Alert.alert('Saved', `${client.firstName}'s rent was updated.`);
    } catch (e: any) {
      Alert.alert('Could not save', e?.message ?? 'Try again.');
    }
  };

  return (
    <Screen>
      <ScreenTitle
        title={`${client.firstName}${client.lastName ? ` ${client.lastName}` : ''}`}
        subtitle={client.houseName || 'Sober Living'}
      />

      {client.phone ? (
        <Card>
          <Text style={[typography.body, { fontWeight: '600' }]}>Invite to the app</Text>
          <Text style={[typography.caption, { marginTop: 2, marginBottom: spacing.sm }]}>
            Text {client.firstName} a link + your join code to download and join.
          </Text>
          <Button title="📲 Text invite to download" variant="secondary" onPress={textInvite} />
        </Card>
      ) : null}

      <SectionTitle>Rent</SectionTitle>
      <Card>
        <Text style={styles.label}>Monthly rent</Text>
        <View style={styles.amtRow}>
          <Text style={styles.dollar}>$</Text>
          <TextInput style={styles.amtInput} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.textMuted} />
        </View>
        <Text style={styles.label}>Due day of month (1–31)</Text>
        <TextInput style={styles.input} value={dueDay} onChangeText={setDueDay} keyboardType="number-pad" placeholder="e.g. 1" placeholderTextColor={colors.textMuted} />
        <Button title="Save rent" onPress={saveRent} />
      </Card>

      <SectionTitle>Status</SectionTitle>
      <Card>
        <Text style={[typography.body, { marginBottom: spacing.sm }]}>
          Currently: <Text style={{ fontWeight: '700' }}>{client.status === 'in_care' ? 'In Care' : 'Completed'}</Text>
        </Text>
        <Button
          title={client.status === 'in_care' ? 'Mark as completed' : 'Reactivate (In Care)'}
          variant="secondary"
          onPress={() => setClientStatus(id, client.status === 'in_care' ? 'completed' : 'in_care')}
        />
      </Card>

      <SectionTitle>Meetings this week</SectionTitle>
      <Card onPress={() => setShowMeetings((v) => !v)}>
        <Text style={styles.meetingCount}>{checkins.length}</Text>
        <Text style={typography.bodySecondary}>
          meeting check-in{checkins.length === 1 ? '' : 's'} in the last 7 days
          {checkins.length ? ` · tap to ${showMeetings ? 'hide' : 'see'} locations` : ''}
        </Text>
        {showMeetings
          ? checkins.map((c) => (
              <View key={c.id} style={styles.checkinRow}>
                <Text style={typography.body}>📍 {c.address || (c.latitude ? `${c.latitude.toFixed(4)}, ${c.longitude.toFixed(4)}` : 'Location not shared')}</Text>
                <Text style={typography.caption}>{formatDateTime(c.createdAt)}</Text>
              </View>
            ))
          : null}
      </Card>

      <View style={{ height: spacing.md }} />
      <Button title={`Open ${client.firstName}'s full view`} onPress={() => selectClient(id)} />
      <Text style={styles.note}>Opens the full client app (check-ins, tasks, notes, messages).</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { ...typography.caption, marginBottom: spacing.xs },
  amtRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceAlt, borderRadius: radius.md, paddingHorizontal: spacing.md, marginBottom: spacing.md },
  dollar: { fontSize: 22, color: colors.textSecondary, marginRight: 4 },
  amtInput: { flex: 1, fontSize: 22, paddingVertical: spacing.sm, color: colors.textPrimary },
  input: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, fontSize: 16, color: colors.textPrimary, marginBottom: spacing.md },
  note: { ...typography.caption, textAlign: 'center', marginTop: spacing.sm },
  meetingCount: { fontSize: 34, fontWeight: '800', color: colors.primary },
  checkinRow: { marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: spacing.sm },
});

