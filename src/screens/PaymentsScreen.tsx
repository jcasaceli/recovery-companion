import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, Alert, ActivityIndicator, Linking } from 'react-native';
import { Screen, ScreenTitle, Card, SectionTitle, Button } from '../components/ui';
import { colors, spacing, radius, typography } from '../theme';
import { startRentCheckout } from '../services/payments';
import { notifyCare } from '../services/push';
import * as dbApi from '../services/db';
import { PaymentMethod } from '../types';

function money(cents?: number) {
  return cents ? `$${(cents / 100).toFixed(2)}` : null;
}
function nextDueLabel(dueDay?: number) {
  if (!dueDay) return null;
  const now = new Date();
  let due = new Date(now.getFullYear(), now.getMonth(), dueDay);
  if (due < now) due = new Date(now.getFullYear(), now.getMonth() + 1, dueDay);
  return due.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
}
function currentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function PaymentsScreen() {
  const [ctx, setCtx] = useState<Awaited<ReturnType<typeof dbApi.getResidentContext>>>(null);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState('');
  const [paidSoFar, setPaidSoFar] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const c = await dbApi.getResidentContext();
        setCtx(c);
        if (c) {
          const pays = await dbApi.listMyPayments(c.individualId).catch(() => []);
          const sum = (pays as any[])
            .filter((p) => p.periodMonth === currentPeriod() && p.status === 'paid')
            .reduce((s, p) => s + p.amountCents, 0);
          setPaidSoFar(sum);
          const remaining = Math.max(0, (c.rentCents ?? 0) - sum);
          if (remaining > 0) setAmount((remaining / 100).toFixed(2));
        }
      } catch {
        setCtx(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const remainingCents = Math.max(0, (ctx?.rentCents ?? 0) - paidSoFar);

  const cents = () => Math.round(parseFloat(amount || '0') * 100);

  const payCard = async (recurring: boolean) => {
    const c = cents();
    if (!c || c < 100) { Alert.alert('Enter an amount'); return; }
    setBusy(true);
    try { await startRentCheckout(recurring, c); }
    catch (e: any) { Alert.alert('Payment unavailable', e?.message ?? 'Try again.'); }
    finally { setBusy(false); }
  };

  // CashApp / Zelle are paid in those apps; we record a member-reported payment.
  const reportManual = async (method: PaymentMethod, openUrl?: string) => {
    const c = cents();
    if (!c || c < 100) { Alert.alert('Enter an amount'); return; }
    if (!ctx) return;
    try {
      if (openUrl) await Linking.openURL(openUrl).catch(() => {});
      const today = new Date().getDate();
      await dbApi.recordPayment({
        individualId: ctx.individualId,
        amountCents: c,
        method,
        onTime: ctx.dueDay ? today <= ctx.dueDay : undefined,
        periodMonth: currentPeriod(),
        status: 'reported', // facilitator confirms it was received
      });
      notifyCare(ctx.individualId, 'Payment reported', `A ${method} payment was reported for confirmation.`);
      Alert.alert('Reported', `Your ${method === 'cashapp' ? 'CashApp' : 'Zelle'} payment was reported to your facilitator. They'll confirm once it's received.`);
    } catch (e: any) {
      Alert.alert('Could not record', e?.message ?? 'Try again.');
    }
  };

  if (loading) {
    return <Screen><ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} /></Screen>;
  }

  if (!ctx) {
    return (
      <Screen>
        <ScreenTitle title="Pay membership fee" />
        <Card>
          <Text style={typography.bodySecondary}>
            Your sober living hasn't linked your account yet. Once your facilitator
            adds you, you'll be able to pay membership fees here.
          </Text>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenTitle title="Pay membership fee" subtitle="Pay your sober living directly" />

      <Card>
        {money(ctx.rentCents) ? (
          <Text style={styles.rent}>{money(ctx.rentCents)}<Text style={styles.per}>/month</Text></Text>
        ) : null}
        {nextDueLabel(ctx.dueDay) ? (
          <Text style={typography.bodySecondary}>Next due: {nextDueLabel(ctx.dueDay)}</Text>
        ) : null}
        {ctx.rentCents ? (
          <Text style={[typography.bodySecondary, { marginTop: 2 }]}>
            Paid this month: {money(paidSoFar) ?? '$0'} · Remaining: {money(remainingCents) ?? '$0'}
          </Text>
        ) : (
          <Text style={typography.bodySecondary}>Your facilitator hasn't set your rent yet.</Text>
        )}
        <Text style={[typography.caption, { marginTop: spacing.sm }]}>Amount to pay (full or partial)</Text>
        <View style={styles.amtRow}>
          <Text style={styles.dollar}>$</Text>
          <TextInput style={styles.amtInput} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.textMuted} />
        </View>
      </Card>

      <SectionTitle>Choose how to pay</SectionTitle>

      {/* Card */}
      <Card>
        <Text style={styles.method}>💳 Debit / Credit card</Text>
        <Text style={[typography.caption, { marginBottom: spacing.sm }]}>Secure card payment via Stripe.</Text>
        <Button title="Pay once" onPress={() => payCard(false)} disabled={busy} />
        <View style={{ height: spacing.sm }} />
        <Button title="Set up monthly auto-pay" variant="secondary" onPress={() => payCard(true)} disabled={busy} />
      </Card>

      {/* CashApp */}
      {ctx.cashapp ? (
        <Card>
          <Text style={styles.method}>💵 CashApp</Text>
          <Text style={[typography.bodySecondary, { marginBottom: spacing.sm }]}>Send to {ctx.cashapp}</Text>
          <Button title="Open CashApp & notify facilitator" onPress={() => reportManual('cashapp', `https://cash.app/${encodeURIComponent(ctx.cashapp!.replace(/^\$?/, '$'))}`)} />
        </Card>
      ) : null}

      {/* Zelle */}
      {ctx.zelle ? (
        <Card>
          <Text style={styles.method}>🏦 Zelle</Text>
          <Text style={[typography.bodySecondary, { marginBottom: spacing.sm }]}>Send to {ctx.zelle}</Text>
          <Button title="I sent it via Zelle (notify facilitator)" onPress={() => reportManual('zelle')} />
        </Card>
      ) : null}

      <Text style={styles.note}>
        Card payments process instantly via Stripe. CashApp/Zelle are logged for
        your facilitator to confirm.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  rent: { fontSize: 34, fontWeight: '800', color: colors.textPrimary },
  per: { fontSize: 16, fontWeight: '500', color: colors.textSecondary },
  amtRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceAlt, borderRadius: radius.md, paddingHorizontal: spacing.md, marginTop: 4 },
  dollar: { fontSize: 22, color: colors.textSecondary, marginRight: 4 },
  amtInput: { flex: 1, fontSize: 22, paddingVertical: spacing.sm, color: colors.textPrimary },
  method: { ...typography.h3, marginBottom: 2 },
  note: { ...typography.caption, marginTop: spacing.md, lineHeight: 17 },
});
