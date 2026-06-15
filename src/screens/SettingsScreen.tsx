import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Alert, TextInput, ActivityIndicator, TouchableOpacity, Modal, Platform, Switch } from 'react-native';
import { Screen, ScreenTitle, Card, SectionTitle, Button } from '../components/ui';
import { colors, spacing, radius, typography } from '../theme';
import { useAppState } from '../state/store';
import { useAuth } from '../state/auth';
import { getConnectStatus, startConnectOnboarding, startPlatformSubscribe, ConnectStatus } from '../services/payments';
import { getMyOrg, setOrgPaymentHandles } from '../services/db';
import { deleteAccount } from '../services/account';
import { getNotifyMemberActivity, setNotifyMemberActivity } from '../services/db';
import { listManagers, addManager, removeManager, Manager } from '../services/managers';

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

  // Owner vs house manager: the owner is the profile that created the org.
  const [isOwner, setIsOwner] = useState(false);
  const [orgName, setOrgName] = useState('');
  const [managers, setManagers] = useState<Manager[]>([]);
  const [priceConfigured, setPriceConfigured] = useState(true);
  const [mgrOpen, setMgrOpen] = useState(false);
  const [mgrName, setMgrName] = useState('');
  const [mgrEmail, setMgrEmail] = useState('');
  const [mgrBusy, setMgrBusy] = useState(false);
  const [newCreds, setNewCreds] = useState<{ email: string; password: string } | null>(null);
  const [notifyActivity, setNotifyActivity] = useState(true);

  const toggleNotify = (v: boolean) => { setNotifyActivity(v); setNotifyMemberActivity(v).catch(() => {}); };

  const loadManagers = () => listManagers()
    .then((r) => { setManagers(r.managers); setPriceConfigured(r.priceConfigured); })
    .catch(() => {});

  useEffect(() => {
    if (isFacilitator) {
      getConnectStatus().then(setConnect).catch(() => setConnect(null));
      getNotifyMemberActivity().then(setNotifyActivity).catch(() => {});
      getMyOrg().then((o: any) => {
        if (o) {
          setOrgId(o.id); setCashapp(o.cashapp_tag ?? ''); setZelle(o.zelle_tag ?? ''); setOrgName(o.name ?? '');
          const owner = !!o.created_by && o.created_by === auth.session?.user?.id;
          setIsOwner(owner);
          if (owner) loadManagers();
        }
      }).catch(() => {});
    }
  }, [isFacilitator]);

  const addMgr = async () => {
    if (!mgrName.trim() || !mgrEmail.trim()) return;
    setMgrBusy(true);
    try {
      const r = await addManager(mgrName.trim(), mgrEmail.trim());
      setNewCreds({ email: r.email, password: r.password });
      setMgrOpen(false); setMgrName(''); setMgrEmail('');
      loadManagers();
    } catch (e: any) {
      Alert.alert('Could not add manager', e?.message ?? 'Try again.');
    } finally {
      setMgrBusy(false);
    }
  };

  const removeMgr = (m: Manager) => {
    Alert.alert('Remove house manager?', `${m.name ?? m.email} will lose access and their $25/mo seat will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => { await removeManager(m.id).catch(() => {}); loadManagers(); } },
    ]);
  };

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

      {isFacilitator && !isOwner ? (
        <Card style={{ borderWidth: 1, borderColor: colors.primary }}>
          <Text style={[typography.body, { fontWeight: '600' }]}>House manager</Text>
          <Text style={[typography.caption, { marginTop: 2 }]}>
            You're a house manager{orgName ? ` for ${orgName}` : ''}. You can manage residents, UAs,
            payments, and agreements. Billing is handled by the owner.
          </Text>
        </Card>
      ) : null}

      {isFacilitator ? (
        <>
          <SectionTitle>Notifications</SectionTitle>
          <Card style={styles.switchRow}>
            <View style={{ flex: 1, paddingRight: spacing.md }}>
              <Text style={[typography.body, { fontWeight: '600' }]}>Resident activity alerts</Text>
              <Text style={typography.caption}>
                Get a push when residents check in at meetings or report a payment. SOS and resident
                messages always come through.
              </Text>
            </View>
            <Switch value={notifyActivity} onValueChange={toggleNotify} trackColor={{ true: colors.primary }} />
          </Card>
        </>
      ) : null}

      {isOwner ? (
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
            {Platform.OS !== 'web' ? (
              <Text style={typography.caption}>
                Manage your subscription from the web dashboard at soberlivingcompanion.com.
              </Text>
            ) : (
              <Button title="Subscribe — $60/mo" variant="secondary" onPress={subscribe} />
            )}
          </Card>

          <SectionTitle>House managers</SectionTitle>
          <Card>
            <Text style={[typography.caption, { marginBottom: spacing.sm }]}>
              Add staff who can manage residents, UAs, payments, and agreements — but not billing.
              Each house manager is +$25/month.
            </Text>
            {managers.map((m) => (
              <View key={m.id} style={styles.mgrRow}>
                <View style={{ flex: 1 }}>
                  <Text style={typography.body}>{m.name || m.email}</Text>
                  {m.name ? <Text style={typography.caption}>{m.email}</Text> : null}
                </View>
                <TouchableOpacity onPress={() => removeMgr(m)} hitSlop={8}>
                  <Text style={{ color: colors.crisis, fontWeight: '600' }}>Remove</Text>
                </TouchableOpacity>
              </View>
            ))}
            {Platform.OS !== 'web' ? (
              <Text style={typography.caption}>
                Add or remove house managers from the web dashboard at soberlivingcompanion.com.
              </Text>
            ) : (
              <Button title="➕ Add house manager (+$25/mo)" variant="secondary" onPress={() => setMgrOpen(true)} />
            )}
            {Platform.OS === 'web' && !priceConfigured ? (
              <Text style={[typography.caption, { marginTop: spacing.sm, color: colors.warning }]}>
                Note: the $25/mo seat price isn't configured yet, so managers won't be auto-billed until it's set up.
              </Text>
            ) : null}
          </Card>
        </>
      ) : null}


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

      {/* Add house manager */}
      <Modal visible={mgrOpen} transparent animationType="fade" onRequestClose={() => setMgrOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.modal}>
            <Text style={typography.h3}>Add house manager</Text>
            <Text style={[typography.caption, { marginTop: 2, marginBottom: spacing.sm }]}>
              We'll create their login and show you a temporary password to share. +$25/month.
            </Text>
            <TextInput style={styles.input} value={mgrName} onChangeText={setMgrName} placeholder="Full name" placeholderTextColor={colors.textMuted} autoCapitalize="words" />
            <TextInput style={styles.input} value={mgrEmail} onChangeText={setMgrEmail} placeholder="Email" placeholderTextColor={colors.textMuted} autoCapitalize="none" keyboardType="email-address" />
            <Button title={mgrBusy ? 'Creating…' : 'Create manager (+$25/mo)'} onPress={addMgr} disabled={mgrBusy || !mgrName.trim() || !mgrEmail.trim()} />
            <TouchableOpacity onPress={() => setMgrOpen(false)} style={{ alignItems: 'center', paddingVertical: spacing.sm }}>
              <Text style={{ color: colors.textSecondary }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* One-time temp-password reveal */}
      <Modal visible={!!newCreds} transparent animationType="fade" onRequestClose={() => setNewCreds(null)}>
        <View style={styles.backdrop}>
          <View style={styles.modal}>
            <Text style={typography.h3}>Manager created ✅</Text>
            <Text style={[typography.caption, { marginTop: 2, marginBottom: spacing.sm }]}>
              Share these with your house manager. The password won't be shown again — they can change it after signing in.
            </Text>
            <View style={styles.credBox}>
              <Text style={styles.credLabel}>Email</Text>
              <Text selectable style={styles.credValue}>{newCreds?.email}</Text>
              <Text style={[styles.credLabel, { marginTop: spacing.sm }]}>Temporary password</Text>
              <Text selectable style={styles.credValue}>{newCreds?.password}</Text>
            </View>
            <Button title="Done" onPress={() => setNewCreds(null)} />
          </View>
        </View>
      </Modal>
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
  mgrRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.divider, marginBottom: spacing.sm },
  switchRow: { flexDirection: 'row', alignItems: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: spacing.lg },
  modal: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md },
  credBox: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  credLabel: { ...typography.caption, color: colors.textMuted },
  credValue: { ...typography.body, fontWeight: '700' },
});
