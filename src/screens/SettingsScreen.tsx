import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Alert, TextInput, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Screen, ScreenTitle, Card, SectionTitle, Button } from '../components/ui';
import { colors, spacing, radius, typography } from '../theme';
import { useAppState } from '../state/store';
import { useAuth } from '../state/auth';
import { getConnectStatus, startConnectOnboarding, startPlatformSubscribe, ConnectStatus } from '../services/payments';
import { getMyOrg, setOrgPaymentHandles } from '../services/db';
import { deleteAccount } from '../services/account';

export function SettingsScreen() {
  const { resetApp } = useAppState();

  const auth = useAuth();
  const isFacilitator = auth.profile?.role === 'facilitator';
  const [connect, setConnect] = useState<ConnectStatus | null>(null);
  const [connectBusy, setConnectBusy] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [cashapp, setCashapp] = useState('');
  const [zelle, setZelle] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (isFacilitator) {
      getConnectStatus().then(setConnect).catch(() => setConnect(null));
      getMyOrg().then((o: any) => {
        if (o) { setOrgId(o.id); setCashapp(o.cashapp_tag ?? ''); setZelle(o.zelle_tag ?? ''); }
      }).catch(() => {});
    }
  }, [isFacilitator]);

  const saveHandles = async () => {
    let id = orgId;
    if (!id) {
      const o: any = await getMyOrg().catch(() => null);
      id = o?.id ?? null;
      if (id) setOrgId(id);
    }
    if (!id) {
      Alert.alert('One sec', 'Still loading your organization — try again in a moment.');
      return;
    }
    try {
      await setOrgPaymentHandles(id, cashapp.trim(), zelle.trim());
      Alert.alert('Saved ✅', 'Your CashApp and Zelle details were saved. Members will see them on the Pay rent screen.');
    } catch (e: any) {
      Alert.alert('Could not save', e?.message ?? 'Try again.');
    }
  };

  const onboard = async () => {
    setConnectBusy(true);
    try {
      await startConnectOnboarding();
      const s = await getConnectStatus().catch(() => null);
      if (s) setConnect(s);
    } catch (e: any) {
      Alert.alert('Payments setup unavailable', e?.message ?? 'Please try again.');
    } finally {
      setConnectBusy(false);
    }
  };

  const subscribe = async () => {
    try {
      await startPlatformSubscribe();
    } catch (e: any) {
      Alert.alert('Could not start subscription', e?.message ?? 'Please try again.');
    }
  };

  const runDelete = async () => {
    setDeleting(true);
    try {
      await deleteAccount();
      Alert.alert('Account deleted', 'Your account and data have been removed.');
      await auth.signOut();
      resetApp();
    } catch (e: any) {
      Alert.alert('Could not delete account', e?.message ?? 'Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  const confirmDelete = () => {
    const detail = isFacilitator
      ? 'This permanently deletes your account, your sober living, and all of its resident records and payment history. This cannot be undone.'
      : 'This permanently deletes your account and all of your data. This cannot be undone.';
    Alert.alert('Delete account?', detail, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          // Second confirmation for an irreversible action.
          Alert.alert('Are you sure?', 'This is permanent.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete my account', style: 'destructive', onPress: runDelete },
          ]),
      },
    ]);
  };

  const confirmReset = () => {
    Alert.alert('Start over?', 'This clears all data on this device and returns to the welcome screen.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Start over', style: 'destructive', onPress: resetApp },
    ]);
  };

  return (
    <Screen>
      <ScreenTitle title="Settings" />

      {isFacilitator ? (
        <>
          <SectionTitle>Payments</SectionTitle>
          <Card>
            <Text style={[typography.body, { fontWeight: '600' }]}>Accept rent from residents</Text>
            <Text style={[typography.caption, { marginTop: 2, marginBottom: spacing.sm }]}>
              {connect?.chargesEnabled
                ? '✅ Connected — you can accept payments. Residents keep 100% to you.'
                : connect?.connected
                ? 'Setup started — finish Stripe onboarding to accept payments.'
                : 'Connect Stripe to accept one-time and recurring rent. Funds go directly to your bank.'}
            </Text>
            <Button
              title={connect?.chargesEnabled ? 'Manage payment setup' : 'Set up payments'}
              onPress={onboard}
              disabled={connectBusy}
            />
            {connectBusy ? <ActivityIndicator style={{ marginTop: spacing.sm }} color={colors.primary} /> : null}
          </Card>
          <Card>
            <Text style={[typography.body, { fontWeight: '600' }]}>CashApp & Zelle</Text>
            <Text style={[typography.caption, { marginTop: 2, marginBottom: spacing.sm }]}>
              Members can pay you directly with these. Shown to them on the Pay rent screen.
            </Text>
            <TextInput style={styles.input} value={cashapp} onChangeText={setCashapp} placeholder="CashApp tag (e.g. $YourTag)" placeholderTextColor={colors.textMuted} autoCapitalize="none" />
            <TextInput style={styles.input} value={zelle} onChangeText={setZelle} placeholder="Zelle email or phone" placeholderTextColor={colors.textMuted} autoCapitalize="none" />
            <Button title="Save CashApp / Zelle" variant="secondary" onPress={saveHandles} />
          </Card>
          <Card>
            <Text style={[typography.body, { fontWeight: '600' }]}>App subscription</Text>
            <Text style={[typography.caption, { marginTop: 2, marginBottom: spacing.sm }]}>
              $60/month to use Sober Living Companion for your sober living.
            </Text>
            <Button title="Subscribe — $60/mo" variant="secondary" onPress={subscribe} />
          </Card>
        </>
      ) : null}

      <SectionTitle>About the assistant</SectionTitle>
      <Card>
        <Text style={typography.bodySecondary}>
          Companion is an AI assistant — not a doctor, therapist, or counselor.
          For clinical questions, use the Messages tab to reach the care team. In
          an emergency, call 911 or 988.
        </Text>
      </Card>

      <View style={{ height: spacing.md }} />
      {auth.configured && auth.status === 'signedIn' ? (
        <>
          {auth.profile ? (
            <Text style={[styles.version, { marginTop: 0, marginBottom: spacing.sm }]}>
              Signed in as {auth.profile.fullName ?? auth.profile.email} · {auth.profile.role}
            </Text>
          ) : null}
          <Button title="Sign out" variant="secondary" onPress={() => auth.signOut()} />
          <TouchableOpacity onPress={confirmDelete} disabled={deleting} style={styles.deleteBtn}>
            {deleting ? (
              <ActivityIndicator color={colors.crisis} />
            ) : (
              <Text style={styles.deleteText}>Delete account</Text>
            )}
          </TouchableOpacity>
        </>
      ) : (
        <Button title="Start over (clear data)" variant="secondary" onPress={confirmReset} />
      )}
      <Text style={styles.version}>Sober Living Companion · preview build</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 16,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  version: { ...typography.caption, textAlign: 'center', marginTop: spacing.lg, color: colors.textMuted },
  deleteBtn: { alignItems: 'center', paddingVertical: spacing.md, marginTop: spacing.sm },
  deleteText: { color: colors.crisis, fontWeight: '600' },
});
