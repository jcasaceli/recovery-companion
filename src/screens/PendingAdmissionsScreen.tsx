import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Image, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { colors, spacing, radius, typography, shadow } from '../theme';
import { useAppState } from '../state/store';
import {
  listPendingAdmissions,
  admitPendingAdmission,
  declinePendingAdmission,
  getAvatarUrls,
} from '../services/db';

type Applicant = {
  id: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  email?: string;
  applied_at?: string;
  avatar_path?: string;
};

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
  const nav = useNavigation<any>();
  const { reloadCloud } = useAppState();
  const [rows, setRows] = useState<Applicant[]>([]);
  const [avatars, setAvatars] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = (await listPendingAdmissions()) as Applicant[];
      setRows(data);
      const paths = data.map((r) => r.avatar_path).filter(Boolean) as string[];
      if (paths.length) getAvatarUrls(paths).then(setAvatars).catch(() => {});
    } catch (e: any) {
      Alert.alert('Pending admissions', e?.message ?? 'Could not load applicants.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const admit = (a: Applicant) => {
    const name = `${a.first_name ?? ''} ${a.last_name ?? ''}`.trim() || 'this applicant';
    Alert.alert(
      'Admit into care?',
      `${name} will become a resident and appear in your Members list. Their move-in date is set to today.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Admit',
          onPress: async () => {
            setBusyId(a.id);
            try {
              await admitPendingAdmission(a.id);
              await reloadCloud();
              await load();
            } catch (e: any) {
              Alert.alert('Could not admit', e?.message ?? 'Please try again.');
            } finally {
              setBusyId(null);
            }
          },
        },
      ],
    );
  };

  const decline = (a: Applicant) => {
    const name = `${a.first_name ?? ''} ${a.last_name ?? ''}`.trim() || 'this applicant';
    Alert.alert(
      'Decline application?',
      `${name} will be removed from Pending Admission. They won't appear in your Members list. You can re-add them later if needed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: async () => {
            setBusyId(a.id);
            try {
              await declinePendingAdmission(a.id);
              await load();
            } catch (e: any) {
              Alert.alert('Could not decline', e?.message ?? 'Please try again.');
            } finally {
              setBusyId(null);
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.headerBar}>
        <Text style={styles.headerTitle}>Pending Admission</Text>
        <Text style={styles.headerSub}>Applicants who submitted an application but haven't been admitted yet</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
        ) : rows.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyEmoji}>📥</Text>
            <Text style={styles.emptyTitle}>No pending applications</Text>
            <Text style={styles.emptyText}>
              When someone fills out your public application form, they'll show up here. Admit them once they check in.
            </Text>
          </View>
        ) : (
          rows.map((a) => {
            const name = `${a.first_name ?? ''} ${a.last_name ?? ''}`.trim() || 'Applicant';
            const contact = [a.phone, a.email].filter(Boolean).join(' · ');
            const busy = busyId === a.id;
            return (
              <View key={a.id} style={styles.card}>
                <TouchableOpacity
                  style={styles.cardTop}
                  activeOpacity={0.7}
                  onPress={() => nav.navigate('ClientProfile', { id: a.id })}
                >
                  {a.avatar_path && avatars[a.avatar_path] ? (
                    <Image source={{ uri: avatars[a.avatar_path] }} style={styles.avatar} />
                  ) : (
                    <View style={styles.avatar}><Text style={styles.avatarText}>{name.charAt(0).toUpperCase()}</Text></View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={typography.h3}>{name}</Text>
                    <Text style={styles.applied}>{appliedLabel(a.applied_at)}</Text>
                    {contact ? <Text style={styles.contact} numberOfLines={1}>{contact}</Text> : null}
                    <Text style={styles.viewLink}>View full application →</Text>
                  </View>
                </TouchableOpacity>

                <View style={styles.actions}>
                  <TouchableOpacity
                    style={[styles.btn, styles.admitBtn, busy ? styles.btnDisabled : null]}
                    disabled={busy}
                    onPress={() => admit(a)}
                  >
                    {busy ? <ActivityIndicator color={colors.textInverse} /> : <Text style={styles.admitText}>✓ Admit into care</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.btn, styles.declineBtn, busy ? styles.btnDisabled : null]}
                    disabled={busy}
                    onPress={() => decline(a)}
                  >
                    <Text style={styles.declineText}>Decline</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
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
  cardTop: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md },
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
});
