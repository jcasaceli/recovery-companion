import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Card, SectionTitle, Button } from '../components/ui';
import { Paywall } from '../components/Paywall';
import { colors, spacing, radius, typography, shadow } from '../theme';
import { useAppState } from '../state/store';
import {
  listFacilitatorIndividuals, listOrgPayments, listOrgAgreements,
  listFlaggedIndividualIds, listOrgCheckins, getMyOrg, Agreement,
} from '../services/db';
import { Payment } from '../types';
import { formatDate } from '../utils/format';

function money(cents = 0) { return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`; }
function period() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
const WEEK_AGO = () => new Date(Date.now() - 7 * 86400000).toISOString();

export function DashboardScreen() {
  const nav = useNavigation<any>();
  const { subscriptionActive, reloadCloud } = useAppState();

  const [members, setMembers] = useState<any[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [flags, setFlags] = useState<string[]>([]);
  const [checkins, setCheckins] = useState<{ individualId: string; createdAt: string }[]>([]);
  const [org, setOrg] = useState<{ name?: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    if (!subscriptionActive) { setLoading(false); return; }
    Promise.all([
      listFacilitatorIndividuals(), listOrgPayments(), listOrgAgreements(),
      listFlaggedIndividualIds(), listOrgCheckins(WEEK_AGO()), getMyOrg(),
    ]).then(([inds, pays, ags, fl, ci, o]: any) => {
      setMembers((inds ?? []).filter((m: any) => (m.status ?? 'in_care') === 'in_care'));
      setPayments(pays ?? []);
      setAgreements(ags ?? []);
      setFlags(fl ?? []);
      setCheckins(ci ?? []);
      setOrg(o ? { name: o.name } : null);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [subscriptionActive]);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const openClient = (id: string) => nav.navigate('Clients', { screen: 'ClientProfile', params: { id } });
  const nameOf = (id: string) => {
    const m = members.find((x) => x.id === id);
    return m ? `${m.first_name}${m.last_name ? ` ${m.last_name}` : ''}` : 'Member';
  };

  if (loading) {
    return <SafeAreaView style={styles.screen} edges={['top']}><ActivityIndicator style={{ marginTop: spacing.xxl }} color={colors.primary} /></SafeAreaView>;
  }
  if (!subscriptionActive) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scroll}><Text style={typography.h1}>Dashboard</Text><Paywall onChanged={reloadCloud} /></ScrollView>
      </SafeAreaView>
    );
  }

  // ── Computations ───────────────────────────────────────────────────────────
  const pd = period();
  const paidSum = (id: string) => payments
    .filter((p) => p.individualId === id && p.periodMonth === pd && p.status === 'paid')
    .reduce((s, p) => s + p.amountCents, 0);

  const withRent = members.filter((m) => (m.monthly_rent_cents || 0) > 0);
  const expected = withRent.reduce((s, m) => s + (m.monthly_rent_cents || 0), 0);
  const collected = withRent.reduce((s, m) => s + Math.min(paidSum(m.id), m.monthly_rent_cents || 0), 0);
  const outstanding = Math.max(0, expected - collected);
  const notPaid = withRent.filter((m) => paidSum(m.id) < (m.monthly_rent_cents || 0));
  const pct = expected ? Math.round((collected / expected) * 100) : 0;

  const signed = agreements.filter((a) => a.status === 'signed');
  const pendingAgs = agreements.filter((a) => a.status !== 'signed');
  const recentPays = [...payments].filter((p) => p.status === 'paid').slice(0, 6);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={typography.h1}>Dashboard</Text>
        <Text style={[typography.bodySecondary, { marginBottom: spacing.md }]}>{org?.name || 'Your sober living'}</Text>

        {/* KPI tiles */}
        <View style={styles.kpiGrid}>
          <Stat label="Members" value={String(members.length)} />
          <Stat label="Collected (mo)" value={money(collected)} color={colors.success} />
          <Stat label="Outstanding" value={money(outstanding)} color={outstanding > 0 ? colors.crisis : colors.textSecondary} />
          <Stat label="Pending agreements" value={String(pendingAgs.length)} color={pendingAgs.length ? colors.warning : colors.textSecondary} />
          <Stat label="Meetings (wk)" value={String(checkins.length)} />
          <Stat label="UA flags" value={String(flags.length)} color={flags.length ? colors.crisis : colors.textSecondary} />
        </View>

        {/* Rent collection */}
        <SectionTitle>Membership fees · this month</SectionTitle>
        <Card>
          <Text style={[typography.body, { fontWeight: '700' }]}>{money(collected)} of {money(expected)} collected · {pct}%</Text>
          <View style={styles.barTrack}><View style={[styles.barFill, { width: `${pct}%` }]} /></View>
          {notPaid.length === 0 ? (
            <Text style={[typography.caption, { marginTop: spacing.sm, color: colors.success }]}>🎉 Everyone is paid up this month.</Text>
          ) : (
            <View style={{ marginTop: spacing.sm }}>
              <Text style={[typography.caption, { marginBottom: spacing.xs }]}>Needs attention ({notPaid.length})</Text>
              {notPaid.map((m) => {
                const sum = paidSum(m.id); const rent = m.monthly_rent_cents || 0;
                const partial = sum > 0;
                return (
                  <TouchableOpacity key={m.id} style={styles.row} onPress={() => openClient(m.id)}>
                    <View style={[styles.dot, { backgroundColor: partial ? colors.warning : colors.crisis }]} />
                    <Text style={[typography.body, { flex: 1 }]}>{m.first_name}{m.last_name ? ` ${m.last_name}` : ''}</Text>
                    <Text style={[typography.caption, { color: partial ? colors.warning : colors.crisis }]}>
                      {partial ? `${money(sum)} / ${money(rent)}` : `${money(rent)} due`}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </Card>

        {/* Agreements */}
        <SectionTitle>Agreements</SectionTitle>
        <Card>
          <Text style={[typography.body, { fontWeight: '700' }]}>{signed.length} signed · {pendingAgs.length} awaiting signature</Text>
          {pendingAgs.slice(0, 6).map((a) => (
            <TouchableOpacity key={a.id} style={styles.row} onPress={() => openClient(a.individualId)}>
              <Text style={styles.docIcon}>📄</Text>
              <Text style={[typography.body, { flex: 1 }]}>{nameOf(a.individualId)}</Text>
              <Text style={[typography.caption, { color: colors.warning }]}>{a.title}</Text>
            </TouchableOpacity>
          ))}
        </Card>

        {/* Flags */}
        {flags.length ? (
          <>
            <SectionTitle>Needs review</SectionTitle>
            <Card style={{ borderWidth: 1, borderColor: colors.crisis }}>
              {flags.map((id) => (
                <TouchableOpacity key={id} style={styles.row} onPress={() => openClient(id)}>
                  <Text style={styles.docIcon}>🚩</Text>
                  <Text style={[typography.body, { flex: 1 }]}>{nameOf(id)}</Text>
                  <Text style={[typography.caption, { color: colors.crisis }]}>Positive UA</Text>
                </TouchableOpacity>
              ))}
            </Card>
          </>
        ) : null}

        {/* Recent payments */}
        <SectionTitle>Recent payments</SectionTitle>
        {recentPays.length === 0 ? (
          <Card><Text style={typography.bodySecondary}>No payments recorded yet.</Text></Card>
        ) : (
          <Card>
            {recentPays.map((p) => (
              <View key={p.id} style={styles.row}>
                <View style={[styles.dot, { backgroundColor: colors.success }]} />
                <Text style={[typography.body, { flex: 1 }]}>{p.memberName ?? 'Resident'}</Text>
                <Text style={typography.caption}>{money(p.amountCents)} · {formatDate(p.paidAt)}</Text>
              </View>
            ))}
          </Card>
        )}

        <View style={{ height: spacing.sm }} />
        <Button title="View all members" variant="secondary" onPress={() => nav.navigate('Clients')} />
        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.kpi}>
      <Text style={[styles.kpiValue, color ? { color } : null]}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.md, paddingBottom: spacing.xxl },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -spacing.xs, marginBottom: spacing.sm },
  kpi: { width: '33.33%', padding: spacing.xs },
  kpiValue: { fontSize: 22, fontWeight: '800', color: colors.textPrimary },
  kpiLabel: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: spacing.sm },
  docIcon: { fontSize: 18, marginRight: spacing.sm },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceAlt, marginTop: spacing.sm, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4, backgroundColor: colors.success },
});
