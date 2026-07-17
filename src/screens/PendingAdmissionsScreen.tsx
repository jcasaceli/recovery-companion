import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Image, Platform, Linking, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, radius, typography, shadow } from '../theme';
import { useAppState } from '../state/store';
import {
  listPendingAdmissions,
  listDeclinedAdmissions,
  admitPendingAdmission,
  declinePendingAdmission,
  restorePendingAdmission,
  getAvatarUrls,
  listDocuments,
  getDocumentUrl,
} from '../services/db';

type AppField = { label?: string; type?: string; value?: any };
type AppPage = { title?: string; fields?: AppField[] };
type Applicant = {
  id: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  email?: string;
  applied_at?: string;
  avatar_path?: string;
  intake_data?: { pages?: AppPage[] } | null;
};

const fullName = (a: Applicant) => `${a.first_name ?? ''} ${a.last_name ?? ''}`.trim();

// Alert.alert is a no-op on react-native-web, so use the browser dialogs there.
function confirmThen(title: string, message: string, confirmLabel: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    const g: any = globalThis;
    if (!g.confirm || g.confirm(`${title}\n\n${message}`)) onConfirm();
  } else {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: confirmLabel, onPress: onConfirm },
    ]);
  }
}
function notify(title: string, message?: string) {
  if (Platform.OS === 'web') { const g: any = globalThis; if (g.alert) g.alert(message ? `${title}\n\n${message}` : title); }
  else Alert.alert(title, message ?? '');
}

// Renders one submitted field inside the in-app application viewer.
function renderAppField(f: AppField, i: number) {
  const label = (f.label || '').trim();
  const type = f.type || 'text';
  const isImg = typeof f.value === 'string' && f.value.startsWith('data:');
  if (type === 'signature' || (type === 'image')) {
    return (
      <View key={i} style={styles.appField}>
        {label ? <Text style={styles.appLabel}>{label}</Text> : null}
        {isImg ? (
          <Image source={{ uri: f.value }} style={styles.appSig} resizeMode="contain" />
        ) : (
          <Text style={styles.appValue}>{type === 'signature' ? '(not signed)' : '(no file uploaded)'}</Text>
        )}
      </View>
    );
  }
  let shown = f.value;
  if (shown === true || shown === 'true') shown = 'Yes';
  else if (shown === false || shown === 'false' || shown === '' || shown == null) shown = '—';
  if (!label && shown === '—') return null; // skip empty content blocks
  return (
    <View key={i} style={styles.appField}>
      {label ? <Text style={styles.appLabel}>{label}</Text> : null}
      <Text style={styles.appValue}>{String(shown)}</Text>
    </View>
  );
}

function appliedLabel(iso?: string) {
  if (!iso) return 'Applied recently';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'Applied recently';
  const day = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  let rel = '';
  if (mins < 60) rel = ` · ${Math.max(1, mins)}m ago`;
  else if (mins < 1440) rel = ` · ${Math.round(mins / 60)}h ago`;
  else if (mins < 1440 * 14) rel = ` · ${Math.round(mins / 1440)}d ago`;
  return `Applied ${day}${rel}`;
}

export function PendingAdmissionsScreen() {
  const { reloadCloud } = useAppState();
  const [rows, setRows] = useState<Applicant[]>([]);
  const [declined, setDeclined] = useState<Applicant[]>([]);
  const [avatars, setAvatars] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<Applicant | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  // Open the applicant's full application. The backend saves it as a formatted
  // PDF on their profile when they submit — so we can show it here without
  // admitting them (they aren't in the Members roster yet).
  // Show the full application right inside the app (from the data they submitted)
  // — reliable on web + native, no popups. Fetch the printable PDF in the
  // background as an optional extra.
  const openApplication = (a: Applicant) => {
    setViewing(a);
    setPdfUrl(null);
    (async () => {
      try {
        const docs = await listDocuments(a.id);
        const doc = docs.find((d) => /application/i.test(d.title || '') && d.storagePath) || docs.find((d) => d.storagePath);
        if (doc?.storagePath) { const u = await getDocumentUrl(doc.storagePath); if (u) setPdfUrl(u); }
      } catch { /* PDF is optional — the in-app view already has everything */ }
    })();
  };
  const openPdf = () => {
    if (!pdfUrl) return;
    if (Platform.OS === 'web') { const g: any = globalThis; g.open(pdfUrl, '_blank'); }
    else Linking.openURL(pdfUrl).catch(() => {});
  };

  const load = useCallback(async () => {
    try {
      const [pending, dec] = await Promise.all([
        listPendingAdmissions() as Promise<Applicant[]>,
        listDeclinedAdmissions() as Promise<Applicant[]>,
      ]);
      setRows(pending);
      setDeclined(dec);
      const paths = [...pending, ...dec].map((r) => r.avatar_path).filter(Boolean) as string[];
      if (paths.length) getAvatarUrls(paths).then(setAvatars).catch(() => {});
    } catch (e: any) {
      notify('Pending admissions', e?.message ?? 'Could not load applicants.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const admit = (a: Applicant) => {
    const name = fullName(a) || 'this applicant';
    confirmThen(
      'Admit into care?',
      `${name} will become a resident and appear in your Members list. Their move-in date is set to today.`,
      'Admit',
      async () => {
        setBusyId(a.id);
        try {
          await admitPendingAdmission(a.id);
          setViewing(null);
          await reloadCloud();
          await load();
        } catch (e: any) {
          notify('Could not admit', e?.message ?? 'Please try again.');
        } finally {
          setBusyId(null);
        }
      },
    );
  };

  const decline = (a: Applicant) => {
    const name = fullName(a) || 'this applicant';
    confirmThen(
      'Decline application?',
      `${name} will move to Declined. Their info and full application are saved — you can view or restore them anytime. They won't appear in your Members list.`,
      'Decline',
      async () => {
        setBusyId(a.id);
        try {
          await declinePendingAdmission(a.id);
          setViewing(null);
          await load();
        } catch (e: any) {
          notify('Could not decline', e?.message ?? 'Please try again.');
        } finally {
          setBusyId(null);
        }
      },
    );
  };

  const restore = async (a: Applicant) => {
    setBusyId(a.id);
    try {
      await restorePendingAdmission(a.id);
      await load();
    } catch (e: any) {
      notify('Could not restore', e?.message ?? 'Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  const renderCard = (a: Applicant, kind: 'pending' | 'declined') => {
    const name = `${a.first_name ?? ''} ${a.last_name ?? ''}`.trim() || 'Applicant';
    const contact = [a.phone, a.email].filter(Boolean).join(' · ');
    const busy = busyId === a.id;
    const isDeclined = kind === 'declined';
    return (
      <View key={a.id} style={[styles.card, isDeclined ? styles.cardDeclined : null]}>
        <TouchableOpacity style={styles.cardTop} activeOpacity={0.7} onPress={() => openApplication(a)}>
          {a.avatar_path && avatars[a.avatar_path] ? (
            <Image source={{ uri: avatars[a.avatar_path] }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, isDeclined ? styles.avatarMuted : null]}><Text style={styles.avatarText}>{name.charAt(0).toUpperCase()}</Text></View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={typography.h3}>{name}</Text>
            <Text style={styles.applied}>{appliedLabel(a.applied_at)}</Text>
            {contact ? <Text style={styles.contact} numberOfLines={1}>{contact}</Text> : null}
            <Text style={styles.viewLink}>📄 View full application →</Text>
          </View>
        </TouchableOpacity>

        <View style={styles.actions}>
          <TouchableOpacity style={[styles.btn, styles.admitBtn, busy ? styles.btnDisabled : null]} disabled={busy} onPress={() => admit(a)}>
            {busy ? <ActivityIndicator color={colors.textInverse} /> : <Text style={styles.admitText}>✓ Admit into care</Text>}
          </TouchableOpacity>
          {isDeclined ? (
            <TouchableOpacity style={[styles.btn, styles.declineBtn, busy ? styles.btnDisabled : null]} disabled={busy} onPress={() => restore(a)}>
              <Text style={styles.restoreText}>↩ Restore</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={[styles.btn, styles.declineBtn, busy ? styles.btnDisabled : null]} disabled={busy} onPress={() => decline(a)}>
              <Text style={styles.declineText}>Decline</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.headerBar}>
        <Text style={styles.headerTitle}>Pending Admission</Text>
        <Text style={styles.headerSub}>Applicants who submitted an application but haven't been admitted yet</Text>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
        ) : rows.length === 0 && declined.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyEmoji}>📥</Text>
            <Text style={styles.emptyTitle}>No pending applications</Text>
            <Text style={styles.emptyText}>
              When someone fills out your public application form, they'll show up here. Admit them once they check in.
            </Text>
          </View>
        ) : (
          <>
            {rows.length > 0
              ? rows.map((a) => renderCard(a, 'pending'))
              : <Text style={styles.noneNote}>No pending applications right now.</Text>}

            {declined.length > 0 ? (
              <>
                <Text style={styles.sectionLabel}>DECLINED · {declined.length}</Text>
                <Text style={styles.sectionHint}>Their info and full application are saved. Restore them to pending, or admit them, anytime.</Text>
                {declined.map((a) => renderCard(a, 'declined'))}
              </>
            ) : null}
          </>
        )}
      </ScrollView>

      {/* Full application viewer — renders what they submitted, right in the app */}
      <Modal visible={!!viewing} animationType="slide" onRequestClose={() => setViewing(null)}>
        <SafeAreaView style={styles.screen} edges={['top']}>
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle} numberOfLines={1}>{viewing ? (fullName(viewing) || 'Application') : 'Application'}</Text>
              <Text style={styles.headerSub}>Full application</Text>
            </View>
            <TouchableOpacity onPress={() => setViewing(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.closeX}>Close</Text>
            </TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            {(viewing?.intake_data?.pages && viewing.intake_data.pages.length > 0) ? (
              viewing.intake_data.pages.map((p, pi) => (
                <View key={pi} style={styles.appPage}>
                  {p.title ? <Text style={styles.appSection}>{p.title}</Text> : null}
                  {(p.fields || []).map((f, fi) => renderAppField(f, fi))}
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>No application details were captured for this applicant.</Text>
            )}
            {pdfUrl ? (
              <TouchableOpacity style={[styles.btn, styles.admitBtn, { marginTop: spacing.md }]} onPress={openPdf}>
                <Text style={styles.admitText}>📄 Open printable PDF</Text>
              </TouchableOpacity>
            ) : null}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  headerBar: { backgroundColor: colors.primaryDark, padding: spacing.md, margin: spacing.md, marginBottom: spacing.sm, borderRadius: radius.md },
  headerTitle: { fontSize: 22, fontWeight: '800', color: colors.textInverse },
  headerSub: { fontSize: 12, color: colors.primaryLight, marginTop: 2 },
  scroll: { padding: spacing.md, paddingBottom: spacing.xxl },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md, ...shadow.card },
  cardDeclined: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, shadowOpacity: 0, elevation: 0 },
  cardTop: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md },
  avatarMuted: { backgroundColor: colors.textMuted },
  noneNote: { ...typography.bodySecondary, marginBottom: spacing.md },
  sectionLabel: { fontSize: 12, fontWeight: '800', color: colors.textMuted, letterSpacing: 0.6, marginTop: spacing.md, marginBottom: 2 },
  sectionHint: { ...typography.caption, marginBottom: spacing.md },
  restoreText: { color: colors.primaryDark, fontWeight: '700', fontSize: 14 },
  avatarText: { color: colors.textInverse, fontWeight: '700', fontSize: 20 },
  applied: { ...typography.caption, marginTop: 1 },
  contact: { ...typography.caption, color: colors.textSecondary, marginTop: 1 },
  viewLink: { color: colors.primary, fontWeight: '700', fontSize: 12.5, marginTop: 5 },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  btn: { borderRadius: radius.md, paddingVertical: spacing.sm + 3, alignItems: 'center', justifyContent: 'center' },
  admitBtn: { flex: 1, backgroundColor: colors.primary },
  admitText: { color: colors.textInverse, fontWeight: '800', fontSize: 14.5 },
  declineBtn: { paddingHorizontal: spacing.lg, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  declineText: { color: colors.crisis, fontWeight: '700', fontSize: 14 },
  btnDisabled: { opacity: 0.6 },
  emptyWrap: { alignItems: 'center', marginTop: spacing.xxl, paddingHorizontal: spacing.lg },
  emptyEmoji: { fontSize: 44, marginBottom: spacing.sm },
  emptyTitle: { ...typography.h3, marginBottom: 6 },
  emptyText: { ...typography.bodySecondary, textAlign: 'center' },
  // Application viewer modal
  modalHeader: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primaryDark, padding: spacing.md, margin: spacing.md, marginBottom: spacing.sm, borderRadius: radius.md },
  closeX: { color: colors.textInverse, fontWeight: '800', fontSize: 14, marginLeft: spacing.md },
  appPage: { marginBottom: spacing.md },
  appSection: { ...typography.h3, fontSize: 16, color: colors.primaryDark, marginTop: spacing.sm, marginBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.divider, paddingBottom: 4 },
  appField: { marginBottom: spacing.sm },
  appLabel: { ...typography.caption, color: colors.textMuted, fontWeight: '700' },
  appValue: { ...typography.body },
  appSig: { width: 220, height: 90, backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, marginTop: 4 },
});
