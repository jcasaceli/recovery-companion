import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Modal, TextInput, Switch, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Card, SectionTitle, Button } from '../components/ui';
import { Paywall } from '../components/Paywall';
import { colors, spacing, radius, typography, shadow } from '../theme';
import { useAppState } from '../state/store';
import {
  listFacilitatorIndividuals, listOrgPayments, listOrgAgreements,
  listFlaggedIndividualIds, listOrgCheckins, getMyOrg, Agreement,
  listHouses, listHouseEvents, createHouseEvent, deleteHouseEvent, House, HouseEvent,
  listOrgPasses, reviewPass, Pass, setPassesEnabled, getMyHouseScope,
} from '../services/db';
import { Payment } from '../types';
import { notifyCare } from '../services/push';
import { formatDate, houseEventWhen, to12h } from '../utils/format';
import { DateField, TimeField } from '../components/PickerFields';

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
  const [org, setOrg] = useState<{ id?: string; name?: string; passesEnabled?: boolean } | null>(null);
  const [houses, setHouses] = useState<House[]>([]);
  const [events, setEvents] = useState<HouseEvent[]>([]);
  const [passes, setPasses] = useState<Pass[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);

  // Add-house-meeting modal
  const [evtOpen, setEvtOpen] = useState(false);
  const [evtHouseId, setEvtHouseId] = useState<string | undefined>(undefined);
  const [evtTitle, setEvtTitle] = useState('');
  const [evtDate, setEvtDate] = useState('');
  const [evtTime, setEvtTime] = useState('');
  const [evtMandatory, setEvtMandatory] = useState(false);
  const [evtRecurring, setEvtRecurring] = useState(false);
  const [evtBusy, setEvtBusy] = useState(false);

  const loadEvents = () => { listHouses().then(setHouses).catch(() => {}); listHouseEvents().then(setEvents).catch(() => {}); };
  const loadPasses = () => { listOrgPasses('pending').then(setPasses).catch(() => {}); };

  const load = useCallback(() => {
    if (!subscriptionActive) { setLoading(false); return; }
    loadEvents();
    loadPasses();
    getMyHouseScope().then((s) => setIsOwner(s.isOwner)).catch(() => {});
    Promise.all([
      listFacilitatorIndividuals(), listOrgPayments(), listOrgAgreements(),
      listFlaggedIndividualIds(), listOrgCheckins(WEEK_AGO()), getMyOrg(),
    ]).then(([inds, pays, ags, fl, ci, o]: any) => {
      setMembers((inds ?? []).filter((m: any) => (m.status ?? 'in_care') === 'in_care'));
      setPayments(pays ?? []);
      setAgreements(ags ?? []);
      setFlags(fl ?? []);
      setCheckins(ci ?? []);
      setOrg(o ? { id: o.id, name: o.name, passesEnabled: !!o.passes_enabled } : null);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [subscriptionActive]);

  const saveEvent = async () => {
    if (!evtHouseId || !evtTitle.trim() || !evtDate) {
      Alert.alert('Missing info', 'Pick a house, a title, and a date.');
      return;
    }
    setEvtBusy(true);
    try {
      await createHouseEvent({ houseId: evtHouseId, title: evtTitle.trim(), date: evtDate, time: evtTime || undefined, mandatory: evtMandatory, recurring: evtRecurring });
      setEvtOpen(false); setEvtTitle(''); setEvtDate(''); setEvtTime(''); setEvtMandatory(false); setEvtRecurring(false);
      loadEvents();
    } catch (e: any) { Alert.alert('Could not add', e?.message ?? 'Try again.'); }
    finally { setEvtBusy(false); }
  };

  const removeEvent = (e: HouseEvent) => {
    Alert.alert('Delete meeting?', `Remove “${e.title}”?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await deleteHouseEvent(e.id).catch(() => {}); loadEvents(); } },
    ]);
  };
  const houseName = (id: string) => houses.find((h) => h.id === id)?.name ?? 'House';

  const decide = (p: Pass, status: 'approved' | 'denied') => {
    const act = status === 'approved' ? 'Approve' : 'Deny';
    Alert.alert(`${act} pass?`, `${act} ${p.memberName ?? 'this member'}’s ${p.type === 'overnight' ? 'overnight' : 'multi-day'} pass?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: act, style: status === 'denied' ? 'destructive' : 'default',
        onPress: async () => {
          try {
            await reviewPass(p.id, status);
            notifyCare(p.individualId, `Pass ${status}`, `Your ${p.type === 'overnight' ? 'overnight' : 'multi-day'} pass was ${status}.`, 'alert');
          } catch (e: any) { Alert.alert('Could not update', e?.message ?? 'Try again.'); }
          loadPasses();
        },
      },
    ]);
  };

  const togglePasses = async (next: boolean) => {
    if (!org?.id) return;
    setOrg({ ...org, passesEnabled: next });
    try { await setPassesEnabled(org.id, next); }
    catch (e: any) { setOrg({ ...org, passesEnabled: !next }); Alert.alert('Could not change', e?.message ?? 'Try again.'); }
  };

  const passWhen = (p: Pass) =>
    p.type === 'overnight'
      ? `Overnight · ${formatDate(p.startDate)}${p.returnTime ? ` · back by ${to12h(p.returnTime)}` : ''}`
      : `${formatDate(p.startDate)} → ${formatDate(p.endDate)}${p.returnTime ? ` · back by ${to12h(p.returnTime)}` : ''}`;

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
          <Stat label="Pass requests" value={String(passes.length)} color={passes.length ? colors.warning : colors.textSecondary} />
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

        {/* Pass requests */}
        <SectionTitle>Pass requests</SectionTitle>
        <Card>
          {isOwner ? (
            <View style={styles.evtSwitch}>
              <View style={{ flex: 1 }}>
                <Text style={typography.body}>Allow pass requests</Text>
                <Text style={typography.caption}>When on, every member can request overnight & multi-day passes.</Text>
              </View>
              <Switch value={!!org?.passesEnabled} onValueChange={togglePasses} trackColor={{ true: colors.primary }} />
            </View>
          ) : null}
          {passes.length === 0 ? (
            <Text style={[typography.bodySecondary, isOwner ? { marginTop: spacing.sm } : null]}>No pending pass requests.</Text>
          ) : (
            passes.map((p) => (
              <View key={p.id} style={styles.passCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={[typography.body, { flex: 1, fontWeight: '700' }]}>{p.memberName ?? 'Member'}</Text>
                  <Text style={[typography.caption, { color: colors.warning, fontWeight: '700' }]}>
                    {p.type === 'overnight' ? 'OVERNIGHT' : 'MULTI-DAY'}
                  </Text>
                </View>
                <Text style={typography.caption}>{passWhen(p)}</Text>
                {p.destination ? <Text style={typography.caption}>📍 {p.destination}</Text> : null}
                {p.reason ? <Text style={typography.caption}>📝 {p.reason}</Text> : null}
                {p.contactPhone ? <Text style={typography.caption}>📞 {p.contactPhone}</Text> : null}
                <View style={styles.passBtns}>
                  <TouchableOpacity style={[styles.passBtn, { backgroundColor: colors.success }]} onPress={() => decide(p, 'approved')}>
                    <Text style={styles.passBtnText}>Approve</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.passBtn, { backgroundColor: colors.crisis }]} onPress={() => decide(p, 'denied')}>
                    <Text style={styles.passBtnText}>Deny</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </Card>

        {/* House meetings */}
        <SectionTitle>House meetings</SectionTitle>
        <Card>
          {events.length === 0 ? (
            <Text style={typography.bodySecondary}>No upcoming meetings. Add one so it appears on members’ Home screens.</Text>
          ) : (
            events.map((e) => (
              <TouchableOpacity key={e.id} style={styles.row} onLongPress={() => removeEvent(e)}>
                <View style={{ flex: 1 }}>
                  <Text style={typography.body}>{e.title}{e.mandatory ? <Text style={{ color: colors.crisis, fontWeight: '800', fontSize: 11 }}>  · MANDATORY</Text> : null}</Text>
                  <Text style={typography.caption}>{houseName(e.houseId)} · {houseEventWhen(e.date, e.time, e.recurring)}</Text>
                </View>
              </TouchableOpacity>
            ))
          )}
          <View style={{ height: spacing.sm }} />
          <Button title="➕ Add house meeting" variant="secondary" onPress={() => { setEvtHouseId(houses[0]?.id); setEvtOpen(true); }} />
          {events.length ? <Text style={[typography.caption, { color: colors.textMuted, marginTop: 4 }]}>Long-press a meeting to delete it.</Text> : null}
        </Card>

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

      {/* Add house meeting */}
      <Modal visible={evtOpen} transparent animationType="fade" onRequestClose={() => setEvtOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.modal}>
            <Text style={typography.h3}>Add house meeting</Text>
            {houses.length > 1 ? (
              <View style={styles.evtChips}>
                {houses.map((h) => (
                  <TouchableOpacity key={h.id} onPress={() => setEvtHouseId(h.id)} style={[styles.evtChip, evtHouseId === h.id ? styles.evtChipOn : null]}>
                    <Text style={[styles.evtChipText, evtHouseId === h.id ? { color: colors.textInverse } : null]}>{h.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
            <TextInput style={styles.evtInput} value={evtTitle} onChangeText={setEvtTitle} placeholder="Title (e.g. House meeting)" placeholderTextColor={colors.textMuted} />
            <DateField value={evtDate} onChange={setEvtDate} placeholder="Pick a date" />
            <TimeField value={evtTime} onChange={setEvtTime} placeholder="Pick a time (optional)" />
            <View style={styles.evtSwitch}>
              <Text style={typography.body}>Mandatory</Text>
              <Switch value={evtMandatory} onValueChange={setEvtMandatory} trackColor={{ true: colors.crisis }} />
            </View>
            <View style={styles.evtSwitch}>
              <View style={{ flex: 1 }}>
                <Text style={typography.body}>Repeats weekly</Text>
                <Text style={typography.caption}>Shows on members’ Home every week on this weekday.</Text>
              </View>
              <Switch value={evtRecurring} onValueChange={setEvtRecurring} trackColor={{ true: colors.primary }} />
            </View>
            <Button title={evtBusy ? 'Adding…' : 'Add meeting'} onPress={saveEvent} disabled={evtBusy} />
            <TouchableOpacity onPress={() => setEvtOpen(false)} style={{ alignItems: 'center', paddingVertical: spacing.sm }}><Text style={{ color: colors.textSecondary }}>Cancel</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: spacing.lg },
  modal: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md },
  evtInput: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, fontSize: 15, color: colors.textPrimary, marginVertical: spacing.xs },
  evtChips: { flexDirection: 'row', flexWrap: 'wrap', marginVertical: spacing.sm },
  evtChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, marginRight: spacing.sm, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
  evtChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  evtChipText: { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
  evtSwitch: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: spacing.sm },
  passCard: { borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: spacing.sm, marginTop: spacing.sm },
  passBtns: { flexDirection: 'row', marginTop: spacing.sm },
  passBtn: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radius.md, marginRight: spacing.sm },
  passBtnText: { color: colors.textInverse, fontWeight: '700' },
});
