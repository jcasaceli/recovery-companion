import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView } from 'react-native';
import { Card, SectionTitle, Button } from '../components/ui';
import { PieChart } from '../components/PieChart';
import { colors, spacing, radius, typography, shadow } from '../theme';
import * as dbApi from '../services/db';
import { Payment, PaymentMethod } from '../types';
import { formatDate } from '../utils/format';
import { useAppState } from '../state/store';
import { Paywall } from '../components/Paywall';
import { DEMO_CLIENTS, DEMO_PAY_STATUS, DEMO_PIE } from '../data/demo';

const METHODS: PaymentMethod[] = ['cash', 'cashapp', 'zelle', 'card', 'other'];
const METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: 'Cash', cashapp: 'CashApp', zelle: 'Zelle', card: 'Card', other: 'Other',
};

function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function money(cents?: number) {
  return cents ? `$${(cents / 100).toFixed(2)}` : '$0';
}

export function FacilitatorPaymentsScreen() {
  const [members, setMembers] = useState<any[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [recordFor, setRecordFor] = useState<any | null>(null);
  const [rentFor, setRentFor] = useState<any | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { subscriptionActive, reloadCloud } = useAppState();
  const locked = !subscriptionActive;

  const load = useCallback(async () => {
    if (locked) { setLoading(false); return; }
    try {
      const [inds, pays] = await Promise.all([dbApi.listFacilitatorIndividuals(), dbApi.listOrgPayments()]);
      setMembers((inds ?? []).filter((m: any) => (m.status ?? 'in_care') === 'in_care'));
      setPayments(pays);
    } catch (e) {
      // surfaced elsewhere
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Preview mode: sample analytics until the org subscribes.
  if (locked) {
    const statusLabel: Record<string, string> = { paid: 'Paid in full', partial: 'Partially paid', none: 'Not paid', norent: 'No fee set' };
    const statusClr: Record<string, string> = { paid: colors.success, partial: colors.warning, none: colors.crisis, norent: colors.textMuted };
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={typography.h1}>Payments</Text>
          <Paywall onChanged={reloadCloud} />
          <Card style={{ alignItems: 'center' }}>
            <SectionTitle>This month (sample)</SectionTitle>
            <PieChart
              data={[
                { label: 'Paid in full', value: DEMO_PIE.paid, color: colors.success },
                { label: 'Partially paid', value: DEMO_PIE.partial, color: colors.warning },
                { label: 'Not paid', value: DEMO_PIE.none, color: colors.crisis },
              ]}
            />
          </Card>
          <SectionTitle>Members (sample)</SectionTitle>
          {DEMO_CLIENTS.map((c) => {
            const st = DEMO_PAY_STATUS[c.id] ?? 'norent';
            return (
              <Card key={c.id}>
                <Text style={typography.h3}>{c.firstName}{c.lastName ? ` ${c.lastName}` : ''}</Text>
                <Text style={typography.caption}>
                  Fee {money(c.monthlyRentCents)}{c.rentDueDay ? ` · due the ${ordinal(c.rentDueDay)}` : ''}
                </Text>
                <Text style={[styles.statusLine, { color: statusClr[st] }]}>{statusLabel[st]}</Text>
              </Card>
            );
          })}
        </ScrollView>
      </SafeAreaView>
    );
  }

  const period = currentPeriod();
  // Sum of CONFIRMED payments this month for a client.
  const paidSum = (id: string) =>
    payments
      .filter((p) => p.individualId === id && p.periodMonth === period && p.status === 'paid')
      .reduce((s, p) => s + p.amountCents, 0);

  // 'paid' (sum ≥ rent), 'partial' (0 < sum < rent), 'none' (sum 0). Only for rent > 0.
  const payStatus = (m: any): 'paid' | 'partial' | 'none' | 'norent' => {
    const rent = m.monthly_rent_cents || 0;
    if (rent <= 0) return 'norent';
    const sum = paidSum(m.id);
    if (sum >= rent) return 'paid';
    if (sum > 0) return 'partial';
    return 'none';
  };

  const confirm = async (id: string) => {
    try { await dbApi.confirmPayment(id); load(); }
    catch (e: any) { Alert.alert('Could not confirm', e?.message ?? 'Try again.'); }
  };

  // Analytics for the current month (only clients who owe rent).
  let paid = 0, partial = 0, none = 0;
  for (const m of members) {
    const s = payStatus(m);
    if (s === 'paid') paid++;
    else if (s === 'partial') partial++;
    else if (s === 'none') none++;
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <ActivityIndicator style={{ marginTop: spacing.xxl }} color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={typography.h1}>Payments</Text>

        <Card style={{ alignItems: 'center' }}>
          <SectionTitle>This month</SectionTitle>
          <PieChart
            data={[
              { label: 'Paid in full', value: paid, color: colors.success },
              { label: 'Partially paid', value: partial, color: colors.warning },
              { label: 'Not paid', value: none, color: colors.crisis },
            ]}
          />
        </Card>

        <SectionTitle>Members</SectionTitle>
        {members.length === 0 ? (
          <Card><Text style={typography.bodySecondary}>No active members yet.</Text></Card>
        ) : (
          members.map((m) => {
            const st = payStatus(m);
            const sum = paidSum(m.id);
            const rent = m.monthly_rent_cents || 0;
            const expanded = expandedId === m.id;
            const history = payments.filter((p) => p.individualId === m.id);
            const statusText =
              st === 'norent' ? 'No fee set'
              : st === 'paid' ? `Paid in full (${money(sum)})`
              : st === 'partial' ? `Partial: ${money(sum)} of ${money(rent)}`
              : `Not paid (${money(rent)} due)`;
            const statusColor =
              st === 'paid' ? colors.success : st === 'partial' ? colors.warning : st === 'none' ? colors.crisis : colors.textMuted;
            return (
              <Card key={m.id}>
                <View style={styles.memberRow}>
                  <TouchableOpacity style={{ flex: 1 }} activeOpacity={0.7} onPress={() => setExpandedId(expanded ? null : m.id)}>
                    <Text style={typography.h3}>{m.first_name}{m.last_name ? ` ${m.last_name}` : ''}</Text>
                    <Text style={typography.caption}>
                      Fee {money(m.monthly_rent_cents)}
                      {m.rent_due_day ? ` · due the ${ordinal(m.rent_due_day)}` : ''}
                    </Text>
                    <Text style={[styles.statusLine, { color: statusColor }]}>{statusText}</Text>
                    <Text style={styles.expandHint}>
                      {history.length} payment{history.length === 1 ? '' : 's'} · tap to {expanded ? 'hide' : 'view'} history
                    </Text>
                  </TouchableOpacity>
                  <View style={{ alignItems: 'flex-end' }}>
                    <TouchableOpacity style={styles.recordBtn} onPress={() => setRecordFor(m)}>
                      <Text style={styles.recordBtnText}>Record</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.rentBtn} onPress={() => setRentFor(m)}>
                      <Text style={styles.rentBtnText}>Set membership fee</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {expanded ? (
                  <View style={styles.history}>
                    {history.length === 0 ? (
                      <Text style={typography.bodySecondary}>No payments recorded yet.</Text>
                    ) : (
                      history.map((p) => (
                        <View key={p.id} style={styles.histRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={typography.body}>{money(p.amountCents)} · {METHOD_LABEL[p.method]}</Text>
                            <Text style={typography.caption}>
                              {formatDate(p.paidAt)}
                              {p.onTime === false ? ' · late' : p.onTime ? ' · on time' : ''}
                              {p.status === 'reported' ? ' · reported (unconfirmed)' : ''}
                            </Text>
                          </View>
                          {p.status === 'reported' ? (
                            <TouchableOpacity style={styles.confirmBtn} onPress={() => confirm(p.id)}>
                              <Text style={styles.confirmBtnText}>Confirm</Text>
                            </TouchableOpacity>
                          ) : null}
                        </View>
                      ))
                    )}
                  </View>
                ) : null}
              </Card>
            );
          })
        )}

        <SectionTitle>Recent payments</SectionTitle>
        {payments.length === 0 ? (
          <Card><Text style={typography.bodySecondary}>No payments recorded yet.</Text></Card>
        ) : (
          payments.slice(0, 30).map((p) => (
            <Card key={p.id} style={styles.payRow}>
              <View style={{ flex: 1 }}>
                <Text style={typography.body}>{p.memberName ?? 'Member'} · {money(p.amountCents)}</Text>
                <Text style={typography.caption}>
                  {METHOD_LABEL[p.method]} · {formatDate(p.paidAt)}
                  {p.onTime === false ? ' · late' : p.onTime ? ' · on time' : ''}
                </Text>
              </View>
            </Card>
          ))
        )}
      </ScrollView>

      <RecordModal
        member={recordFor}
        onClose={() => setRecordFor(null)}
        onSaved={() => { setRecordFor(null); load(); }}
      />
      <RentModal
        member={rentFor}
        onClose={() => setRentFor(null)}
        onSaved={() => { setRentFor(null); load(); }}
      />
    </SafeAreaView>
  );
}

function RentModal({ member, onClose, onSaved }: { member: any | null; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState('');
  const [dueDay, setDueDay] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (member) {
      setAmount(member.monthly_rent_cents ? (member.monthly_rent_cents / 100).toFixed(2) : '');
      setDueDay(member.rent_due_day ? String(member.rent_due_day) : '');
    }
  }, [member]);

  if (!member) return null;

  const save = async () => {
    const cents = amount ? Math.round(parseFloat(amount) * 100) : null;
    const day = dueDay ? Math.min(31, Math.max(1, parseInt(dueDay, 10))) : null;
    setBusy(true);
    try {
      await dbApi.setMemberRent(member.id, cents, day);
      onSaved();
    } catch (e: any) {
      Alert.alert('Could not save', e?.message ?? 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <Text style={typography.h3}>Set membership fee · {member.first_name}</Text>
          <Text style={[typography.caption, { marginTop: spacing.xs }]}>Monthly membership fee</Text>
          <View style={styles.amtRow}>
            <Text style={styles.dollar}>$</Text>
            <TextInput style={styles.amtInput} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.textMuted} />
          </View>
          <Text style={[typography.caption]}>Due day of month (1–31)</Text>
          <TextInput style={styles.dueInput} value={dueDay} onChangeText={setDueDay} keyboardType="number-pad" placeholder="e.g. 1" placeholderTextColor={colors.textMuted} />
          <Button title="Save membership fee" onPress={save} disabled={busy} />
          <TouchableOpacity onPress={onClose} style={{ alignItems: 'center', paddingVertical: spacing.sm }}>
            <Text style={{ color: colors.textSecondary }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function RecordModal({ member, onClose, onSaved }: { member: any | null; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (member) setAmount(member.monthly_rent_cents ? (member.monthly_rent_cents / 100).toFixed(2) : '');
  }, [member]);

  if (!member) return null;

  const save = async () => {
    const cents = Math.round(parseFloat(amount || '0') * 100);
    if (!cents) { Alert.alert('Enter an amount'); return; }
    setBusy(true);
    try {
      const today = new Date().getDate();
      const onTime = member.rent_due_day ? today <= member.rent_due_day : undefined;
      await dbApi.recordPayment({
        individualId: member.id,
        orgId: member.org_id,
        amountCents: cents,
        method,
        onTime,
        periodMonth: currentPeriod(),
      });
      onSaved();
    } catch (e: any) {
      Alert.alert('Could not record', e?.message ?? 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <Text style={typography.h3}>Record payment · {member.first_name}</Text>
          <View style={styles.amtRow}>
            <Text style={styles.dollar}>$</Text>
            <TextInput style={styles.amtInput} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.textMuted} />
          </View>
          <View style={styles.chips}>
            {METHODS.map((mth) => (
              <TouchableOpacity key={mth} onPress={() => setMethod(mth)} style={[styles.chip, method === mth ? styles.chipActive : null]}>
                <Text style={[styles.chipText, method === mth ? styles.chipTextActive : null]}>{METHOD_LABEL[mth]}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Button title="Save payment" onPress={save} disabled={busy} />
          <TouchableOpacity onPress={onClose} style={{ alignItems: 'center', paddingVertical: spacing.sm }}>
            <Text style={{ color: colors.textSecondary }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.md, paddingBottom: spacing.xxl },
  memberRow: { flexDirection: 'row', alignItems: 'center' },
  statusLine: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  expandHint: { fontSize: 12, color: colors.primary, marginTop: 4, fontWeight: '600' },
  history: { marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: spacing.sm },
  histRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  confirmBtn: { backgroundColor: colors.success, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  confirmBtnText: { color: colors.textInverse, fontWeight: '700', fontSize: 12 },
  recordBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginBottom: 6 },
  recordBtnText: { color: colors.textInverse, fontWeight: '700', fontSize: 13 },
  rentBtn: { paddingHorizontal: spacing.md, paddingVertical: 4 },
  rentBtnText: { color: colors.primary, fontWeight: '600', fontSize: 12 },
  dueInput: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, fontSize: 16, color: colors.textPrimary, marginTop: 4, marginBottom: spacing.md },
  payRow: { paddingVertical: spacing.sm + 2 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: spacing.lg },
  modal: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md },
  amtRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceAlt, borderRadius: radius.md, paddingHorizontal: spacing.md, marginVertical: spacing.md },
  dollar: { fontSize: 22, color: colors.textSecondary, marginRight: 4 },
  amtInput: { flex: 1, fontSize: 22, paddingVertical: spacing.sm, color: colors.textPrimary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, marginRight: spacing.sm, marginBottom: spacing.sm },
  chipActive: { backgroundColor: colors.primary },
  chipText: { fontSize: 13, color: colors.textSecondary },
  chipTextActive: { color: colors.textInverse, fontWeight: '600' },
});
