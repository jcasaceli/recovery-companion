import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Alert } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { Screen, ScreenTitle, Card, SectionTitle, Button } from '../components/ui';
import { colors, spacing, radius, typography } from '../theme';
import { useAppState } from '../state/store';
import { getJoinCode } from '../services/db';

export function ClientProfileScreen() {
  const route = useRoute<any>();
  const { id } = route.params;
  const { clients, setRent, setClientStatus, selectClient } = useAppState();
  const client = clients.find((c) => c.id === id);

  const [amount, setAmount] = useState(client?.monthlyRentCents ? (client.monthlyRentCents / 100).toFixed(2) : '');
  const [dueDay, setDueDay] = useState(client?.rentDueDay ? String(client.rentDueDay) : '');

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

  const invite = async () => {
    try {
      const code = await getJoinCode(id);
      Alert.alert(`Invite ${client.firstName}`, `Share this join code. They sign up as a member and enter it to link their account:\n\n${code}`);
    } catch (e: any) {
      Alert.alert('Could not get code', e?.message ?? 'Try again.');
    }
  };

  return (
    <Screen>
      <ScreenTitle title={client.firstName} subtitle="Sober Living" />

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

      <SectionTitle>Member account</SectionTitle>
      <Card>
        <Text style={[typography.bodySecondary, { marginBottom: spacing.sm }]}>
          Invite {client.firstName} to their own account to view progress and pay rent.
        </Text>
        <Button title="Show invite code" variant="secondary" onPress={invite} />
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
});
