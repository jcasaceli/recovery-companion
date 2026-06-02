import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Alert, ActivityIndicator } from 'react-native';
import { Screen, ScreenTitle, Card, SectionTitle, Button } from '../components/ui';
import { colors, spacing, radius, typography } from '../theme';
import { startRentCheckout } from '../services/payments';

/** Resident-facing rent payment. One-time or monthly auto-pay, paid directly to
 *  the sober living operator (100% theirs). */
export function PaymentsScreen() {
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);

  const cents = () => Math.round(parseFloat(amount || '0') * 100);

  const pay = async (recurring: boolean) => {
    const c = cents();
    if (!c || c < 100) {
      Alert.alert('Enter an amount', 'Please enter the rent amount (at least $1).');
      return;
    }
    setBusy(true);
    try {
      await startRentCheckout(recurring, c);
    } catch (e: any) {
      Alert.alert('Payment unavailable', e?.message ?? 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ScreenTitle title="Pay rent" subtitle="Pay your sober living directly & securely" />

      <Card>
        <SectionTitle>Amount</SectionTitle>
        <View style={styles.amountRow}>
          <Text style={styles.dollar}>$</Text>
          <TextInput
            style={styles.input}
            value={amount}
            onChangeText={setAmount}
            placeholder="0.00"
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
          />
        </View>

        <View style={{ height: spacing.sm }} />
        <Button title="Pay once" onPress={() => pay(false)} disabled={busy} />
        <View style={{ height: spacing.sm }} />
        <Button title="Set up monthly auto-pay" variant="secondary" onPress={() => pay(true)} disabled={busy} />
        {busy ? <ActivityIndicator style={{ marginTop: spacing.md }} color={colors.primary} /> : null}
      </Card>

      <Text style={styles.note}>
        Payments are processed securely by Stripe and go directly to your sober
        living. We never see your card details. (Test mode until your operator
        completes payment setup.)
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  amountRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceAlt, borderRadius: radius.md, paddingHorizontal: spacing.md },
  dollar: { fontSize: 24, color: colors.textSecondary, marginRight: spacing.xs },
  input: { flex: 1, fontSize: 24, paddingVertical: spacing.md, color: colors.textPrimary },
  note: { ...typography.caption, marginTop: spacing.md, lineHeight: 17 },
});
