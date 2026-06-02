import React, { useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert, Platform } from 'react-native';
import { Card, Button } from './ui';
import { colors, spacing, radius, typography } from '../theme';
import { startPlatformSubscribe } from '../services/payments';

const PERKS = [
  'Add and manage your residents',
  'Collect rent by card, CashApp & Zelle',
  'See who’s paid, partial, or behind',
  'Track meeting check-ins & alerts',
];

/** Locked-state card shown to facilitators whose org is not subscribed.
 *  Subscription checkout opens in the browser (web checkout, not in-app
 *  purchase) so the operator keeps 100% of resident rent. */
export function Paywall({ onChanged }: { onChanged?: () => void }) {
  const [busy, setBusy] = useState(false);

  const subscribe = async () => {
    setBusy(true);
    try {
      await startPlatformSubscribe();
      // They finish in the browser; refresh status when they return.
      onChanged?.();
    } catch (e: any) {
      Alert.alert('Could not start subscription', e?.message ?? 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={styles.card}>
      <Text style={styles.lock}>🔒</Text>
      <Text style={styles.title}>Activate your sober living</Text>
      <Text style={styles.sub}>
        You’re in preview mode. Subscribe for $60/month to start adding residents and
        collecting rent. The roster below is sample data.
      </Text>
      <View style={styles.perks}>
        {PERKS.map((p) => (
          <Text key={p} style={styles.perk}>✓ {p}</Text>
        ))}
      </View>
      <Button title="Subscribe — $60/mo" onPress={subscribe} disabled={busy} />
      {busy ? <ActivityIndicator style={{ marginTop: spacing.sm }} color={colors.primary} /> : null}
      <Text style={styles.fine}>
        {Platform.OS === 'ios'
          ? 'Secure checkout opens in your browser. Rent paid by your residents goes 100% to you.'
          : 'Secure checkout. Rent paid by your residents goes 100% to you.'}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', borderWidth: 1, borderColor: colors.primary },
  lock: { fontSize: 34, marginBottom: spacing.xs },
  title: { ...typography.h2, textAlign: 'center' },
  sub: { ...typography.bodySecondary, textAlign: 'center', marginTop: spacing.xs, marginBottom: spacing.md },
  perks: { alignSelf: 'stretch', marginBottom: spacing.md },
  perk: { ...typography.body, marginVertical: 2 },
  fine: { ...typography.caption, textAlign: 'center', marginTop: spacing.sm },
});
