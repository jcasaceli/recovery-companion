import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, Alert, ActivityIndicator, Switch, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView } from 'react-native';
import { Card, SectionTitle, Button } from '../components/ui';
import { KeyboardModal } from '../components/KeyboardModal';
import { PieChart } from '../components/PieChart';
import { colors, spacing, radius, typography, shadow } from '../theme';
import * as dbApi from '../services/db';
import { Payment, PaymentMethod } from '../types';
import { formatDate } from '../utils/format';
import { DateField } from '../components/PickerFields';
import { sendPaymentReceipt } from '../services/push';
import { useAppState } from '../state/store';
import { Paywall } from '../components/Paywall';
import { DEMO_CLIENTS, DEMO_PAY_STATUS, DEMO_PIE } from '../data/demo';

const METHODS: PaymentMethod[] = ['cash', 'check', 'cashapp', 'zelle', 'venmo', 'card', 'other'];
const METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: 'Cash', check: 'Check', cashapp: 'CashApp', zelle: 'Zelle', venmo: 'Venmo', card: 'Card', other: 'Other',
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
  const [balanceFor, setBalanceFor] = useState<any | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editDatePay, setEditDatePay] = useState<Payment | null>(null);
  const [receiptBusy, setReceiptBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<'members' | 'recent'>('members');
  const [search, setSearch] = useState('');
  const [houseFilter, setHouseFilter] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [org, setOrg] = useState<any | null>(null);
  const [accSaving, setAccSaving] = useState(false);
  const { subscriptionActive, reloadCloud } = useAppState();
  const locked = !subscriptionActive;

  const load = useCallback(async () => {
    if (locked) { setLoading(false); return; }
    try {
      const [inds, pays, o] = await Promise.all([
        dbApi.listFacilitatorIndividuals({ activeOnly: true }),
        dbApi.listOrgPayments(),
        dbApi.getMyOrg(),
      ]);
      setMembers((inds ?? []).filter((m: any) => (m.status ?? 'in_care') === 'in_care'));
      setPayments(pays);
      setOrg(o);
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
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
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

  // Weekly accrual mode (opt-in per org). When on, weekly residents build a
  // running balance instead of being scored month-by-month.
  const accrualOn = !!org?.weekly_accrual_enabled && !!org?.weekly_accrual_since;

  // Sum of ALL confirmed payments for a client, across every month — accrual
  // pays down a running balance, not a single month.
  const paidAll = (id: string) =>
    payments.filter((p) => p.individualId === id && p.status === 'paid').reduce((s, p) => s + p.amountCents, 0);

  const laterOf = (...ds: (string | null | undefined)[]) =>
    ds.filter(Boolean).map((d) => (d as string).slice(0, 10)).sort().pop() ?? '';

  // Computed weekly balance for a resident, or null if accrual doesn't apply.
  // charged = due-weeks elapsed × fee; balance = charged − paid + adjustment.
  const accrualBalance = (m: any): { weeks: number; chargedCents: number; paidCents: number; balanceCents: number } | null => {
    if (!accrualOn || m.rent_period !== 'weekly') return null;
    const fee = dbApi.effectiveFeeCents(m);
    if (fee <= 0) return null;
    const anchor = laterOf(org.weekly_accrual_since, m.rent_start_date, m.move_in_date);
    const weeks = dbApi.weeklyChargesElapsed(anchor, m.rent_due_dow);
    const chargedCents = weeks * fee;
    const paidCents = paidAll(m.id);
    return { weeks, chargedCents, paidCents, balanceCents: chargedCents - paidCents + (m.balance_adjustment_cents || 0) };
  };

  // 'paid' (sum ≥ rent), 'partial' (0 < sum < rent), 'none' (sum 0). Only for rent > 0.
  // Accrual residents are scored on their running balance so the pie stays honest.
  const payStatus = (m: any): 'paid' | 'partial' | 'none' | 'norent' => {
    const acc = accrualBalance(m);
    if (acc) {
      if (acc.chargedCents <= 0) return 'norent';
      if (acc.balanceCents <= 0) return 'paid';
      return acc.paidCents > 0 ? 'partial' : 'none';
    }
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

  // Email the resident an org-branded receipt for a confirmed/recorded payment.
  const sendReceipt = async (p: Payment) => {
    setReceiptBusy(p.id);
    try {
      const r = await sendPaymentReceipt(p.id);
      if (r.sent) Alert.alert('Receipt sent ✅', `Emailed a receipt to ${p.memberName ?? 'the resident'}.`);
      else if (r.error === 'no_email') Alert.alert('No email on file', `Add an email to ${p.memberName ?? 'this resident'}’s profile first, then send the receipt.`);
      else Alert.alert('Could not send receipt', r.error ?? 'Please try again.');
    } finally { setReceiptBusy(null); }
  };

  // Decline a reported payment (submitted by accident / wrong amount / never
  // actually sent). Confirms first, then removes it from the ledger.
  const decline = (p: Payment) => {
    const doDecline = async () => {
      try { await dbApi.declinePayment(p.id); load(); }
      catch (e: any) { Alert.alert('Could not decline', e?.message ?? 'Try again.'); }
    };
    const msg = `Remove ${p.memberName ?? 'this member'}'s reported ${money(p.amountCents)} payment? Use this if it was submitted by mistake. It won't count toward their balance.`;
    if (Platform.OS === 'web') { const g: any = globalThis; if (!g.confirm || g.confirm(msg)) doDecline(); }
    else Alert.alert('Decline payment?', msg, [{ text: 'Cancel', style: 'cancel' }, { text: 'Decline', style: 'destructive', onPress: doDecline }]);
  };

  // House filter + name search. "Unassigned" collects members with no house.
  const houseNames = Array.from(new Set(members.map((m) => m.house_name || 'Unassigned'))).sort();
  const q = search.trim().toLowerCase();
  const nameOf = (m: any) => `${m.first_name} ${m.last_name || ''}`.trim();
  const shown = members.filter((m) => {
    if (houseFilter && (m.house_name || 'Unassigned') !== houseFilter) return false;
    if (q && !nameOf(m).toLowerCase().includes(q)) return false;
    return true;
  });

  // Analytics for the current month reflect the current filter (only fee-owing clients).
  let paid = 0, partial = 0, none = 0;
  for (const m of shown) {
    const s = payStatus(m);
    if (s === 'paid') paid++;
    else if (s === 'partial') partial++;
    else if (s === 'none') none++;
  }

  // Recent-payments tab: newest first, filtered by the same name search.
  const recentShown = payments.filter((p) => !q || (p.memberName ?? '').toLowerCase().includes(q));

  // Bulk selection (respects the active house filter + search, so filtering to a
  // house then "select all" selects exactly that house's residents).
  const shownIds = shown.map((m) => m.id);
  const allSelected = shownIds.length > 0 && shownIds.every((id) => selected.has(id));
  const toggleOne = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected((s) => {
    const n = new Set(s);
    if (allSelected) shownIds.forEach((id) => n.delete(id));
    else shownIds.forEach((id) => n.add(id));
    return n;
  });
  const exitSelect = () => { setSelectMode(false); setSelected(new Set()); };
  const selectedMembers = members.filter((m) => selected.has(m.id));

  // One-tap: price a whole house. Selects every resident in the filtered house
  // and opens the bulk fee modal (which then asks for confirmation before saving).
  const priceWholeHouse = () => {
    if (!shownIds.length) return;
    setSelectMode(true);
    setSelected(new Set(shownIds));
    setBulkOpen(true);
  };
  // If every selected resident is in one house, the confirmation can name it.
  const selectedHouses = Array.from(new Set(selectedMembers.map((m) => m.house_name || 'Unassigned')));
  const bulkHouseName = selectedHouses.length === 1 ? selectedHouses[0] : null;

  // Weekly-accrual toggle. Only surfaced when the home actually has weekly
  // residents (or already has it on), so monthly-only homes never see it.
  const hasWeekly = members.some((m) => m.rent_period === 'weekly');
  const toggleAccrual = async (next: boolean) => {
    if (!org?.id || accSaving) return;
    const prev = org;
    const t = new Date();
    const todayISO = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
    setOrg({ ...org, weekly_accrual_enabled: next, weekly_accrual_since: org.weekly_accrual_since ?? todayISO });
    setAccSaving(true);
    try {
      await dbApi.setWeeklyAccrualEnabled(org.id, next);
      setOrg(await dbApi.getMyOrg());
    } catch (e: any) {
      setOrg(prev);
      Alert.alert('Could not change', e?.message ?? 'Please try again.');
    } finally {
      setAccSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <ActivityIndicator style={{ marginTop: spacing.xxl }} color={colors.primary} />
      </SafeAreaView>
    );
  }

  // One member card — reused whether the list is grouped by house or flat.
  const memberCard = (m: any) => {
    const st = payStatus(m);
    const sum = paidSum(m.id);
    const rent = m.monthly_rent_cents || 0;
    const bal = m.balance_adjustment_cents || 0;
    const acc = accrualBalance(m);
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const notStarted = m.rent_start_date && m.rent_start_date > todayStr;
    const expanded = expandedId === m.id;
    const history = payments.filter((p) => p.individualId === m.id);
    const weeksLabel = acc ? `${acc.weeks} wk${acc.weeks === 1 ? '' : 's'}` : '';
    const statusText =
      notStarted ? `Plan starts ${formatDate(m.rent_start_date)}`
      // Accrual residents: show the running balance, not a monthly verdict.
      : acc && acc.chargedCents > 0 ? (
          acc.balanceCents > 0 ? `Balance owed: ${money(acc.balanceCents)} · ${weeksLabel} billed`
          : acc.balanceCents < 0 ? `Credit: ${money(-acc.balanceCents)}`
          : `Up to date · ${weeksLabel} billed`
        )
      : acc ? 'No fee set'
      : st === 'norent' ? 'No fee set'
      : st === 'paid' ? `Paid in full (${money(sum)})`
      : st === 'partial' ? `Partial: ${money(sum)} of ${money(rent)}`
      : `Not paid (${money(rent)} due)`;
    const statusColor =
      notStarted ? colors.textMuted
      : st === 'paid' ? colors.success : st === 'partial' ? colors.warning : st === 'none' ? colors.crisis : colors.textMuted;
    const isSel = selected.has(m.id);
    return (
      <Card key={m.id} style={selectMode && isSel ? styles.cardSel : undefined}>
        <View style={styles.memberRow}>
          {selectMode ? (
            <TouchableOpacity onPress={() => toggleOne(m.id)} style={styles.checkbox} activeOpacity={0.7}>
              <View style={[styles.checkboxBox, isSel && styles.checkboxOn]}>{isSel ? <Text style={styles.checkboxTick}>✓</Text> : null}</View>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={0.7} onPress={() => (selectMode ? toggleOne(m.id) : setExpandedId(expanded ? null : m.id))}>
            <Text style={typography.h3}>{m.first_name}{m.last_name ? ` ${m.last_name}` : ''}</Text>
            <Text style={typography.caption}>
              Fee {feeLine(m)}
            </Text>
            <Text style={[styles.statusLine, { color: statusColor }]}>{statusText}</Text>
            {bal !== 0 && !acc ? (
              <Text style={[styles.statusLine, { color: bal > 0 ? colors.crisis : colors.success }]}>
                {bal > 0 ? `Balance owed: +${money(bal)}` : `Credit: ${money(-bal)}`}{m.balance_note ? ` · ${m.balance_note}` : ''}
              </Text>
            ) : null}
            {acc && bal !== 0 && m.balance_note ? (
              <Text style={styles.expandHint}>Adjustment applied: {m.balance_note}</Text>
            ) : null}
            {!selectMode ? (
              <Text style={styles.expandHint}>
                {history.length} payment{history.length === 1 ? '' : 's'} · tap to {expanded ? 'hide' : 'view'} history
              </Text>
            ) : null}
          </TouchableOpacity>
          {!selectMode ? (
            <View style={{ alignItems: 'flex-end' }}>
              <TouchableOpacity style={styles.recordBtn} onPress={() => setRecordFor(m)}>
                <Text style={styles.recordBtnText}>Record</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.rentBtn} onPress={() => setRentFor(m)}>
                <Text style={styles.rentBtnText}>Set membership fee</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.rentBtn} onPress={() => setBalanceFor(m)}>
                <Text style={styles.rentBtnText}>Adjust balance</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

        {expanded && !selectMode ? (
          <View style={styles.history}>
            {history.length === 0 ? (
              <Text style={typography.bodySecondary}>No payments recorded yet.</Text>
            ) : (
              history.map((p) => (
                <View key={p.id} style={styles.histRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={typography.body}>{money(p.amountCents)} · {METHOD_LABEL[p.method]}</Text>
                    <TouchableOpacity onPress={() => setEditDatePay(p)}>
                      <Text style={typography.caption}>
                        {formatDate(p.paidAt)}
                        {p.onTime === false ? ' · late' : p.onTime ? ' · on time' : ''}
                        {p.status === 'reported' ? ' · reported (unconfirmed)' : ''}
                        {'  ✎'}
                      </Text>
                    </TouchableOpacity>
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
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={typography.h1}>Payments</Text>

        {/* Members / Recent payments tabs */}
        <View style={styles.tabRow}>
          {(['members', 'recent'] as const).map((t) => (
            <TouchableOpacity key={t} onPress={() => setTab(t)} style={[styles.tabBtn, tab === t && styles.tabBtnOn]}>
              <Text style={[styles.tabTxt, tab === t && styles.tabTxtOn]}>{t === 'members' ? 'Members' : 'Recent payments'}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Name search (both tabs) */}
        <View style={styles.searchWrap}>
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search a member's name"
            placeholderTextColor={colors.textMuted}
            autoCorrect={false}
            autoCapitalize="none"
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.clearX}>✕</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {tab === 'members' ? (
          <>
            {/* Bulk fee tools: enter selection mode, then select all (respects house filter) */}
            <View style={styles.bulkBar}>
              {!selectMode ? (
                <TouchableOpacity onPress={() => setSelectMode(true)} style={styles.bulkToggle}>
                  <Text style={styles.bulkToggleTxt}>Set fees in bulk</Text>
                </TouchableOpacity>
              ) : (
                <>
                  <TouchableOpacity onPress={toggleAll} style={styles.selAll}>
                    <View style={[styles.checkboxBox, allSelected && styles.checkboxOn]}>{allSelected ? <Text style={styles.checkboxTick}>✓</Text> : null}</View>
                    <Text style={styles.selAllTxt}>Select all{houseFilter ? ` in ${houseFilter}` : ''} ({shownIds.length})</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={exitSelect}><Text style={styles.bulkCancel}>Cancel</Text></TouchableOpacity>
                </>
              )}
            </View>

            {/* House filter — tap a house to view just its residents */}
            {houseNames.length > 1 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.houseChips}>
                <TouchableOpacity onPress={() => setHouseFilter(null)} style={[styles.hChip, !houseFilter && styles.hChipOn]}>
                  <Text style={[styles.hChipTxt, !houseFilter && styles.hChipTxtOn]}>All houses</Text>
                </TouchableOpacity>
                {houseNames.map((h) => (
                  <TouchableOpacity key={h} onPress={() => setHouseFilter(h)} style={[styles.hChip, houseFilter === h && styles.hChipOn]}>
                    <Text style={[styles.hChipTxt, houseFilter === h && styles.hChipTxtOn]}>{h}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : null}

            {/* Price a whole house in one tap (only when viewing a single house) */}
            {houseFilter && !selectMode && shown.length > 0 ? (
              <TouchableOpacity onPress={priceWholeHouse} style={styles.wholeHouseBtn}>
                <Text style={styles.wholeHouseTxt}>💵 Set one price for all of {houseFilter} ({shown.length})</Text>
              </TouchableOpacity>
            ) : null}

            {(hasWeekly || accrualOn) && !selectMode ? (
              <Card>
                <View style={styles.accRow}>
                  <View style={{ flex: 1, paddingRight: spacing.md }}>
                    <Text style={typography.h3}>Track weekly balances</Text>
                    <Text style={typography.caption}>
                      {accrualOn
                        ? `On since ${formatDate(org.weekly_accrual_since)} · each weekly resident builds a balance on their due day.`
                        : 'Unpaid weeks add up into each weekly resident’s running balance. Starts from today — no back-charges.'}
                    </Text>
                  </View>
                  <Switch
                    value={accrualOn}
                    onValueChange={toggleAccrual}
                    disabled={accSaving}
                    trackColor={{ true: colors.primary }}
                  />
                </View>
              </Card>
            ) : null}

            <Card style={{ alignItems: 'center' }}>
              <SectionTitle>{houseFilter ? `${houseFilter} · this month` : 'This month'}</SectionTitle>
              <PieChart
                data={[
                  { label: 'Paid in full', value: paid, color: colors.success },
                  { label: 'Partially paid', value: partial, color: colors.warning },
                  { label: 'Not paid', value: none, color: colors.crisis },
                ]}
              />
            </Card>

            {shown.length === 0 ? (
              <Card><Text style={typography.bodySecondary}>{members.length === 0 ? 'No active members yet.' : 'No members match your search.'}</Text></Card>
            ) : houseFilter ? (
              shown.map(memberCard)
            ) : (
              houseNames
                .filter((h) => shown.some((m) => (m.house_name || 'Unassigned') === h))
                .map((h) => {
                  const inHouse = shown.filter((m) => (m.house_name || 'Unassigned') === h);
                  return (
                    <View key={h}>
                      <Text style={styles.houseHeader}>{h} · {inHouse.length}</Text>
                      {inHouse.map(memberCard)}
                    </View>
                  );
                })
            )}
          </>
        ) : (
          <>
            {recentShown.length === 0 ? (
              <Card><Text style={typography.bodySecondary}>{payments.length === 0 ? 'No payments recorded yet.' : 'No payments match your search.'}</Text></Card>
            ) : (
              recentShown.map((p) => (
                <Card key={p.id} style={styles.payRow}>
                  <View style={styles.memberRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={typography.body}>{p.memberName ?? 'Member'} · {money(p.amountCents)}</Text>
                      <TouchableOpacity onPress={() => setEditDatePay(p)}>
                        <Text style={typography.caption}>
                          {METHOD_LABEL[p.method]} · {formatDate(p.paidAt)}
                          {p.onTime === false ? ' · late' : p.onTime ? ' · on time' : ''}
                          {p.thirdPartyName ? ` · paid by ${p.thirdPartyName}` : ''}
                          {p.status === 'reported' ? (p.thirdPartyName ? ' · awaiting payment' : ' · reported (unconfirmed)') : ''}
                          {'  ✎'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                    {p.status === 'reported' ? (
                      <View style={styles.reportedBtns}>
                        <TouchableOpacity style={styles.confirmBtn} onPress={() => confirm(p.id)}>
                          <Text style={styles.confirmBtnText}>{p.thirdPartyName ? 'Mark paid' : 'Confirm'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.declineBtn2} onPress={() => decline(p)}>
                          <Text style={styles.declineBtn2Text}>Decline</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity style={styles.receiptBtn} onPress={() => sendReceipt(p)} disabled={receiptBusy === p.id}>
                        <Text style={styles.receiptBtnText}>{receiptBusy === p.id ? '…' : '📧 Receipt'}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </Card>
              ))
            )}
          </>
        )}
      </ScrollView>

      {/* Floating action bar while selecting members */}
      {selectMode && tab === 'members' && selected.size > 0 ? (
        <View style={styles.actionBar}>
          <Text style={styles.actionCount}>{selected.size} selected</Text>
          <TouchableOpacity style={styles.actionBtn} onPress={() => setBulkOpen(true)}>
            <Text style={styles.actionBtnTxt}>Set membership fee</Text>
          </TouchableOpacity>
        </View>
      ) : null}

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
      <BalanceModal
        member={balanceFor}
        onClose={() => setBalanceFor(null)}
        onSaved={() => { setBalanceFor(null); load(); }}
      />
      <BulkRentModal
        visible={bulkOpen}
        count={selected.size}
        houseName={bulkHouseName}
        onClose={() => setBulkOpen(false)}
        onSaved={() => { setBulkOpen(false); exitSelect(); load(); }}
        ids={selectedMembers.map((m) => m.id)}
      />
      <EditDateModal
        payment={editDatePay}
        onClose={() => setEditDatePay(null)}
        onSaved={() => { setEditDatePay(null); load(); }}
      />
    </SafeAreaView>
  );
}

function EditDateModal({ payment, onClose, onSaved }: { payment: Payment | null; onClose: () => void; onSaved: () => void }) {
  const [date, setDate] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (payment) {
      setDate((payment.paidAt || '').slice(0, 10));
      setAmount(payment.amountCents ? (payment.amountCents / 100).toFixed(2) : '');
    }
  }, [payment]);
  if (!payment) return null;
  const save = async () => {
    if (!date) return;
    const cents = amount ? Math.round(parseFloat(amount) * 100) : 0;
    if (!cents || cents < 1) { Alert.alert('Enter an amount', 'The payment amount must be more than $0.'); return; }
    setBusy(true);
    try {
      if (cents !== payment.amountCents) await dbApi.updatePaymentAmount(payment.id, cents);
      await dbApi.updatePaymentDate(payment.id, new Date(date + 'T12:00:00').toISOString());
      onSaved();
    } catch (e: any) { Alert.alert('Could not update', e?.message ?? 'Try again.'); }
    finally { setBusy(false); }
  };
  return (
    <KeyboardModal visible onClose={onClose}>
          <Text style={typography.h3}>Edit payment</Text>
          <Text style={[typography.caption, { marginTop: 2, marginBottom: spacing.sm }]}>
            {payment.memberName ?? 'Member'} · {METHOD_LABEL[payment.method]}
          </Text>
          <Text style={typography.caption}>Amount paid</Text>
          <View style={styles.amtRow}>
            <Text style={styles.dollar}>$</Text>
            <TextInput style={styles.amtInput} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.textMuted} />
          </View>
          <Text style={[typography.caption, { marginTop: spacing.sm }]}>Date paid</Text>
          <DateField value={date} onChange={setDate} placeholder="Pick the date paid" />
          <View style={{ height: spacing.sm }} />
          <Button title={busy ? 'Saving…' : 'Save changes'} onPress={save} disabled={busy} />
          <TouchableOpacity onPress={onClose} style={{ alignItems: 'center', paddingVertical: spacing.sm }}>
            <Text style={{ color: colors.textSecondary }}>Cancel</Text>
          </TouchableOpacity>
        </KeyboardModal>
  );
}

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DOW_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** "$190/wk · due Monday" for the roster line — total includes any add-ons. */
function feeLine(m: any): string {
  const total = dbApi.effectiveFeeCents(m);
  if (!total) return '';
  const amt = money(total);
  const adds = [m.dues_enabled && 'dues', m.ac_enabled && 'A/C'].filter(Boolean).join(' + ');
  const addNote = adds ? ` (incl. ${adds})` : '';
  if (m.rent_period === 'weekly') return `${amt}/wk${m.rent_due_dow != null ? ` · due ${DOW_FULL[m.rent_due_dow]}` : ''}${addNote}`;
  return `${amt}${m.rent_due_day ? ` · due the ${ordinal(m.rent_due_day)}` : ''}${addNote}`;
}

function RentModal({ member, onClose, onSaved }: { member: any | null; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState('');
  const [period, setPeriod] = useState<'monthly' | 'weekly'>('monthly');
  const [dueDay, setDueDay] = useState('');
  const [dueDow, setDueDow] = useState<number | null>(null);
  const [duesOn, setDuesOn] = useState(false);
  const [acOn, setAcOn] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (member) {
      setAmount(member.monthly_rent_cents ? (member.monthly_rent_cents / 100).toFixed(2) : '');
      setPeriod(member.rent_period === 'weekly' ? 'weekly' : 'monthly');
      setDueDay(member.rent_due_day ? String(member.rent_due_day) : '');
      setDueDow(member.rent_due_dow ?? null);
      setDuesOn(!!member.dues_enabled);
      setAcOn(!!member.ac_enabled);
      setStartDate(member.rent_start_date ?? '');
    }
  }, [member]);

  if (!member) return null;

  const baseCents = amount ? Math.round(parseFloat(amount) * 100) : 0;
  const totalCents = baseCents + (duesOn ? dbApi.WEEKLY_DUES_CENTS : 0) + (acOn ? dbApi.WEEKLY_AC_CENTS : 0);

  const save = async () => {
    const cents = amount ? Math.round(parseFloat(amount) * 100) : null;
    setBusy(true);
    try {
      const addons = { duesEnabled: duesOn, acEnabled: acOn, startDate: startDate || null };
      if (period === 'weekly') {
        await dbApi.setMemberRent(member.id, cents, { period: 'weekly', dueDow, ...addons });
      } else {
        const day = dueDay ? Math.min(31, Math.max(1, parseInt(dueDay, 10))) : null;
        await dbApi.setMemberRent(member.id, cents, { period: 'monthly', dueDay: day, ...addons });
      }
      onSaved();
    } catch (e: any) {
      Alert.alert('Could not save', e?.message ?? 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardModal visible onClose={onClose}>
          <Text style={typography.h3}>Set membership fee · {member.first_name}</Text>

          {/* Weekly / Monthly toggle */}
          <View style={rentStyles.segment}>
            {(['weekly', 'monthly'] as const).map((p) => (
              <TouchableOpacity key={p} onPress={() => setPeriod(p)} style={[rentStyles.segBtn, period === p && rentStyles.segBtnOn]}>
                <Text style={[rentStyles.segTxt, period === p && rentStyles.segTxtOn]}>{p === 'weekly' ? 'Weekly' : 'Monthly'}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[typography.caption, { marginTop: spacing.xs }]}>{period === 'weekly' ? 'Weekly membership fee' : 'Monthly membership fee'}</Text>
          <View style={styles.amtRow}>
            <Text style={styles.dollar}>$</Text>
            <TextInput style={styles.amtInput} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.textMuted} />
          </View>

          {period === 'weekly' ? (
            <>
              <Text style={typography.caption}>Due each week on</Text>
              <View style={rentStyles.dowRow}>
                {DOW_LABELS.map((d, i) => (
                  <TouchableOpacity key={d} onPress={() => setDueDow(i)} style={[rentStyles.dowChip, dueDow === i && rentStyles.dowChipOn]}>
                    <Text style={[rentStyles.dowTxt, dueDow === i && rentStyles.dowTxtOn]}>{d}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          ) : (
            <>
              <Text style={typography.caption}>Due day of month (1–31)</Text>
              <TextInput style={styles.dueInput} value={dueDay} onChangeText={setDueDay} keyboardType="number-pad" placeholder="e.g. 1" placeholderTextColor={colors.textMuted} />
            </>
          )}

          {/* Optional plan start date — nothing is due before it. */}
          <Text style={[typography.caption, { marginTop: spacing.sm }]}>Plan start date (optional — nothing is due before this)</Text>
          <DateField value={startDate} onChange={setStartDate} placeholder="Starts immediately" />

          {/* Toggleable weekly add-ons */}
          <View style={rentStyles.addRow}>
            <Text style={rentStyles.addLabel}>House dues (+$5)</Text>
            <Switch value={duesOn} onValueChange={setDuesOn} />
          </View>
          <View style={rentStyles.addRow}>
            <Text style={rentStyles.addLabel}>A/C fee (+$10)</Text>
            <Switch value={acOn} onValueChange={setAcOn} />
          </View>
          {(duesOn || acOn) && baseCents > 0 ? (
            <Text style={rentStyles.total}>Weekly total: {money(totalCents)}{period === 'weekly' ? '/wk' : ''}</Text>
          ) : null}

          <Button title="Save membership fee" onPress={save} disabled={busy} />
          <TouchableOpacity onPress={onClose} style={{ alignItems: 'center', paddingVertical: spacing.sm }}>
            <Text style={{ color: colors.textSecondary }}>Cancel</Text>
          </TouchableOpacity>
        </KeyboardModal>
  );
}

/** Add a one-time carryover balance to a resident: a charge they owe (e.g. a
 *  prior balance) or a credit (paid ahead / owed less). */
function BalanceModal({ member, onClose, onSaved }: { member: any | null; onClose: () => void; onSaved: () => void }) {
  const [kind, setKind] = useState<'owe' | 'credit'>('owe');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (member) {
      const bal = member.balance_adjustment_cents || 0;
      setKind(bal < 0 ? 'credit' : 'owe');
      setAmount(bal ? (Math.abs(bal) / 100).toFixed(2) : '');
      setNote(member.balance_note ?? '');
    }
  }, [member]);

  if (!member) return null;

  const save = async () => {
    const cents = amount ? Math.round(parseFloat(amount) * 100) : 0;
    const signed = kind === 'credit' ? -cents : cents;
    setBusy(true);
    try {
      await dbApi.setBalanceAdjustment(member.id, signed, note);
      onSaved();
    } catch (e: any) {
      Alert.alert('Could not save', e?.message ?? 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    setBusy(true);
    try { await dbApi.setBalanceAdjustment(member.id, 0, null); onSaved(); }
    catch (e: any) { Alert.alert('Could not clear', e?.message ?? 'Try again.'); }
    finally { setBusy(false); }
  };

  return (
    <KeyboardModal visible onClose={onClose}>
      <Text style={typography.h3}>Adjust balance · {member.first_name}</Text>
      <Text style={[typography.caption, { marginBottom: spacing.sm }]}>
        Set a one-time balance for this resident — a charge they owe (e.g. a prior balance) or a credit if they've paid ahead. This is separate from their regular membership fee.
      </Text>

      <View style={rentStyles.segment}>
        <TouchableOpacity onPress={() => setKind('owe')} style={[rentStyles.segBtn, kind === 'owe' && rentStyles.segBtnOn]}>
          <Text style={[rentStyles.segTxt, kind === 'owe' && rentStyles.segTxtOn]}>Owes extra</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setKind('credit')} style={[rentStyles.segBtn, kind === 'credit' && rentStyles.segBtnOn]}>
          <Text style={[rentStyles.segTxt, kind === 'credit' && rentStyles.segTxtOn]}>Credit</Text>
        </TouchableOpacity>
      </View>

      <Text style={[typography.caption, { marginTop: spacing.xs }]}>{kind === 'owe' ? 'Amount they owe' : 'Credit amount'}</Text>
      <View style={styles.amtRow}>
        <Text style={styles.dollar}>$</Text>
        <TextInput style={styles.amtInput} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.textMuted} />
      </View>

      <Text style={[typography.caption, { marginTop: spacing.sm }]}>Note (optional)</Text>
      <TextInput style={styles.dueInput} value={note} onChangeText={setNote} placeholder="e.g. Prior balance, move-in credit" placeholderTextColor={colors.textMuted} />

      <View style={{ height: spacing.md }} />
      <Button title={busy ? 'Saving…' : 'Save balance'} onPress={save} disabled={busy} />
      {(member.balance_adjustment_cents || 0) !== 0 ? (
        <TouchableOpacity onPress={clear} style={{ alignItems: 'center', paddingVertical: spacing.sm }} disabled={busy}>
          <Text style={{ color: colors.crisis }}>Clear balance</Text>
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity onPress={onClose} style={{ alignItems: 'center', paddingVertical: spacing.sm }}>
        <Text style={{ color: colors.textSecondary }}>Cancel</Text>
      </TouchableOpacity>
    </KeyboardModal>
  );
}

/** Set the same membership fee on every selected member at once. */
function BulkRentModal({ visible, count, ids, houseName, onClose, onSaved }: {
  visible: boolean; count: number; ids: string[]; houseName?: string | null; onClose: () => void; onSaved: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [period, setPeriod] = useState<'monthly' | 'weekly'>('monthly');
  const [dueDay, setDueDay] = useState('');
  const [dueDow, setDueDow] = useState<number | null>(null);
  const [duesOn, setDuesOn] = useState(false);
  const [acOn, setAcOn] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!visible) return null;

  const baseCents = amount ? Math.round(parseFloat(amount) * 100) : 0;
  const totalCents = baseCents + (duesOn ? dbApi.WEEKLY_DUES_CENTS : 0) + (acOn ? dbApi.WEEKLY_AC_CENTS : 0);

  const doSave = async (cents: number | null) => {
    setBusy(true);
    try {
      const addons = { duesEnabled: duesOn, acEnabled: acOn };
      if (period === 'weekly') {
        await dbApi.setBulkRent(ids, cents, { period: 'weekly', dueDow, ...addons });
      } else {
        const day = dueDay ? Math.min(31, Math.max(1, parseInt(dueDay, 10))) : null;
        await dbApi.setBulkRent(ids, cents, { period: 'monthly', dueDay: day, ...addons });
      }
      onSaved();
    } catch (e: any) {
      Alert.alert('Could not save', e?.message ?? 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  // Confirm before overwriting everyone's fee — this is a bulk change and hard to
  // eyeball, so we spell out exactly who changes and to what.
  const save = () => {
    const cents = amount ? Math.round(parseFloat(amount) * 100) : null;
    const periodWord = period === 'weekly' ? 'a week' : 'a month';
    const amtLabel = cents == null ? 'no membership fee' : `${money(totalCents)} ${periodWord}`;
    const title = houseName
      ? `Change the price for everyone in ${houseName}?`
      : `Change the price for ${count} member${count === 1 ? '' : 's'}?`;
    const who = houseName
      ? `Everyone in ${houseName} (${count} resident${count === 1 ? '' : 's'}) will be updated to ${amtLabel}.`
      : `All ${count} selected resident${count === 1 ? '' : 's'} will be updated to ${amtLabel}.`;
    Alert.alert(
      title,
      `${who}\n\nThis replaces their current fee. You can still set an individual price for anyone afterward.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Yes, update everyone', onPress: () => doSave(cents) },
      ],
    );
  };

  return (
    <KeyboardModal visible onClose={onClose}>
          <Text style={typography.h3}>Set fee for {count} member{count === 1 ? '' : 's'}</Text>
          <Text style={[typography.caption, { marginBottom: spacing.xs }]}>Applies the same membership fee to everyone selected.</Text>

          <View style={rentStyles.segment}>
            {(['weekly', 'monthly'] as const).map((p) => (
              <TouchableOpacity key={p} onPress={() => setPeriod(p)} style={[rentStyles.segBtn, period === p && rentStyles.segBtnOn]}>
                <Text style={[rentStyles.segTxt, period === p && rentStyles.segTxtOn]}>{p === 'weekly' ? 'Weekly' : 'Monthly'}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[typography.caption, { marginTop: spacing.xs }]}>{period === 'weekly' ? 'Weekly membership fee' : 'Monthly membership fee'}</Text>
          <View style={styles.amtRow}>
            <Text style={styles.dollar}>$</Text>
            <TextInput style={styles.amtInput} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.textMuted} />
          </View>

          {period === 'weekly' ? (
            <>
              <Text style={typography.caption}>Due each week on</Text>
              <View style={rentStyles.dowRow}>
                {DOW_LABELS.map((d, i) => (
                  <TouchableOpacity key={d} onPress={() => setDueDow(i)} style={[rentStyles.dowChip, dueDow === i && rentStyles.dowChipOn]}>
                    <Text style={[rentStyles.dowTxt, dueDow === i && rentStyles.dowTxtOn]}>{d}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          ) : (
            <>
              <Text style={typography.caption}>Due day of month (1–31)</Text>
              <TextInput style={styles.dueInput} value={dueDay} onChangeText={setDueDay} keyboardType="number-pad" placeholder="e.g. 1" placeholderTextColor={colors.textMuted} />
            </>
          )}

          <View style={rentStyles.addRow}>
            <Text style={rentStyles.addLabel}>House dues (+$5)</Text>
            <Switch value={duesOn} onValueChange={setDuesOn} />
          </View>
          <View style={rentStyles.addRow}>
            <Text style={rentStyles.addLabel}>A/C fee (+$10)</Text>
            <Switch value={acOn} onValueChange={setAcOn} />
          </View>
          {(duesOn || acOn) && baseCents > 0 ? (
            <Text style={rentStyles.total}>Total each: {money(totalCents)}{period === 'weekly' ? '/wk' : ''}</Text>
          ) : null}

          <Button title={busy ? 'Saving…' : `Apply to ${count} member${count === 1 ? '' : 's'}`} onPress={save} disabled={busy} />
          <TouchableOpacity onPress={onClose} style={{ alignItems: 'center', paddingVertical: spacing.sm }}>
            <Text style={{ color: colors.textSecondary }}>Cancel</Text>
          </TouchableOpacity>
        </KeyboardModal>
  );
}

const rentStyles = StyleSheet.create({
  segment: { flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: 4, marginTop: spacing.sm },
  segBtn: { flex: 1, paddingVertical: spacing.sm, alignItems: 'center', borderRadius: radius.sm },
  segBtnOn: { backgroundColor: colors.surface },
  segTxt: { color: colors.textSecondary, fontWeight: '700' },
  segTxtOn: { color: colors.primary },
  dowRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.xs, marginBottom: spacing.sm },
  dowChip: { paddingVertical: spacing.xs, paddingHorizontal: spacing.sm, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  dowChipOn: { borderColor: colors.primary, backgroundColor: colors.primary },
  dowTxt: { color: colors.textSecondary, fontWeight: '700', fontSize: 13 },
  dowTxtOn: { color: '#fff' },
  addRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.xs, marginTop: spacing.xs },
  addLabel: { ...typography.body, fontWeight: '600' },
  total: { ...typography.body, fontWeight: '800', color: colors.primary, marginTop: spacing.xs, marginBottom: spacing.sm },
});

function RecordModal({ member, onClose, onSaved }: { member: any | null; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [paidDate, setPaidDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [thirdParty, setThirdParty] = useState(false);
  const [thirdPartyName, setThirdPartyName] = useState('');
  const [thirdPartyPaid, setThirdPartyPaid] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (member) {
      setAmount(member.monthly_rent_cents ? (member.monthly_rent_cents / 100).toFixed(2) : '');
      setPaidDate(new Date().toISOString().slice(0, 10));
      setThirdParty(false); setThirdPartyName(''); setThirdPartyPaid(true);
    }
  }, [member]);

  if (!member) return null;

  const save = async () => {
    const cents = Math.round(parseFloat(amount || '0') * 100);
    if (!cents) { Alert.alert('Enter an amount'); return; }
    setBusy(true);
    try {
      const dayOfMonth = paidDate ? parseInt(paidDate.slice(8, 10), 10) : new Date().getDate();
      const onTime = member.rent_due_day ? dayOfMonth <= member.rent_due_day : undefined;
      await dbApi.recordPayment({
        individualId: member.id,
        orgId: member.org_id,
        amountCents: cents,
        method,
        onTime,
        periodMonth: currentPeriod(),
        paidAt: paidDate ? new Date(paidDate + 'T12:00:00').toISOString() : undefined,
        thirdPartyName: thirdParty && thirdPartyName.trim() ? thirdPartyName.trim() : undefined,
        // A third-party invoice that hasn't been paid yet is logged as 'reported'
        // so it does NOT count toward the resident's balance until confirmed.
        status: thirdParty && !thirdPartyPaid ? 'reported' : 'paid',
      });
      onSaved();
    } catch (e: any) {
      Alert.alert('Could not record', e?.message ?? 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardModal visible onClose={onClose}>
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
          <Text style={styles.dateLbl}>Date paid</Text>
          <DateField value={paidDate} onChange={setPaidDate} placeholder="Pick the date paid" />

          <View style={rentStyles.addRow}>
            <Text style={rentStyles.addLabel}>Paid by a third party</Text>
            <Switch value={thirdParty} onValueChange={setThirdParty} trackColor={{ true: colors.primary }} />
          </View>
          {thirdParty ? (
            <>
              <TextInput
                style={styles.dueInput}
                value={thirdPartyName}
                onChangeText={setThirdPartyName}
                placeholder="Third party's name (optional — e.g. agency, family member)"
                placeholderTextColor={colors.textMuted}
              />
              <View style={rentStyles.segment}>
                {([['paid', 'Paid'], ['unpaid', 'Not paid yet']] as const).map(([k, label]) => {
                  const on = (k === 'paid') === thirdPartyPaid;
                  return (
                    <TouchableOpacity key={k} onPress={() => setThirdPartyPaid(k === 'paid')} style={[rentStyles.segBtn, on && rentStyles.segBtnOn]}>
                      <Text style={[rentStyles.segTxt, on && rentStyles.segTxtOn]}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {!thirdPartyPaid ? (
                <Text style={[typography.caption, { color: colors.textMuted, marginTop: 2 }]}>
                  Logged as an open invoice — it won’t count toward {member.first_name}’s balance until you mark it paid (tap “Confirm” on it later).
                </Text>
              ) : null}
            </>
          ) : null}

          <View style={{ height: spacing.sm }} />
          <Button title="Save payment" onPress={save} disabled={busy} />
          <TouchableOpacity onPress={onClose} style={{ alignItems: 'center', paddingVertical: spacing.sm }}>
            <Text style={{ color: colors.textSecondary }}>Cancel</Text>
          </TouchableOpacity>
        </KeyboardModal>
  );
}

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.md, paddingBottom: spacing.xxl },
  tabRow: { flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: 4, marginTop: spacing.sm, marginBottom: spacing.sm },
  tabBtn: { flex: 1, paddingVertical: spacing.sm, alignItems: 'center', borderRadius: radius.sm },
  tabBtnOn: { backgroundColor: colors.surface, ...shadow.card },
  tabTxt: { color: colors.textSecondary, fontWeight: '700', fontSize: 14 },
  tabTxtOn: { color: colors.primary },
  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceAlt, borderRadius: radius.md, paddingHorizontal: spacing.md, marginBottom: spacing.sm },
  searchInput: { flex: 1, paddingVertical: spacing.sm + 2, fontSize: 15, color: colors.textPrimary },
  clearX: { color: colors.textMuted, fontSize: 15, paddingHorizontal: 4, fontWeight: '700' },
  houseChips: { gap: spacing.xs, paddingVertical: 2, paddingRight: spacing.md, marginBottom: spacing.sm },
  hChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  hChipOn: { borderColor: colors.primary, backgroundColor: colors.primary },
  hChipTxt: { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
  hChipTxtOn: { color: colors.textInverse },
  houseHeader: { ...typography.caption, fontWeight: '800', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing.sm, marginBottom: spacing.xs, marginLeft: 2 },
  bulkBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm, minHeight: 32 },
  bulkToggle: { paddingVertical: spacing.xs, paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.primary },
  bulkToggleTxt: { color: colors.primary, fontWeight: '700', fontSize: 13 },
  wholeHouseBtn: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.primary, paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.md, alignItems: 'center', marginBottom: spacing.sm },
  wholeHouseTxt: { color: colors.primary, fontWeight: '800', fontSize: 14 },
  selAll: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  selAllTxt: { ...typography.body, fontWeight: '700', color: colors.textPrimary },
  bulkCancel: { color: colors.textSecondary, fontWeight: '600', paddingHorizontal: spacing.sm },
  checkbox: { paddingRight: spacing.sm, paddingVertical: spacing.sm },
  checkboxBox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  checkboxOn: { backgroundColor: colors.primary },
  checkboxTick: { color: colors.textInverse, fontWeight: '900', fontSize: 14 },
  cardSel: { borderColor: colors.primary, borderWidth: 1.5 },
  actionBar: { position: 'absolute', left: spacing.md, right: spacing.md, bottom: spacing.md, backgroundColor: colors.primaryDark, borderRadius: radius.lg, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', ...shadow.card },
  actionCount: { color: colors.textInverse, fontWeight: '800', fontSize: 15 },
  actionBtn: { backgroundColor: colors.surface, borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  actionBtnTxt: { color: colors.primaryDark, fontWeight: '800', fontSize: 14 },
  memberRow: { flexDirection: 'row', alignItems: 'center' },
  accRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusLine: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  expandHint: { fontSize: 12, color: colors.primary, marginTop: 4, fontWeight: '600' },
  history: { marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: spacing.sm },
  histRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  reportedBtns: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  confirmBtn: { backgroundColor: colors.success, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  confirmBtnText: { color: colors.textInverse, fontWeight: '700', fontSize: 12 },
  declineBtn2: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.crisis, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  declineBtn2Text: { color: colors.crisis, fontWeight: '700', fontSize: 12 },
  recordBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginBottom: 6 },
  recordBtnText: { color: colors.textInverse, fontWeight: '700', fontSize: 13 },
  rentBtn: { paddingHorizontal: spacing.md, paddingVertical: 4 },
  rentBtnText: { color: colors.primary, fontWeight: '600', fontSize: 12 },
  dueInput: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, fontSize: 16, color: colors.textPrimary, marginTop: 4, marginBottom: spacing.md },
  payRow: { paddingVertical: spacing.sm + 2 },
  receiptBtn: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.primary, marginLeft: spacing.sm },
  receiptBtnText: { color: colors.primary, fontWeight: '700', fontSize: 12 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: spacing.lg },
  modal: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md },
  amtRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceAlt, borderRadius: radius.md, paddingHorizontal: spacing.md, marginVertical: spacing.md },
  dollar: { fontSize: 22, color: colors.textSecondary, marginRight: 4 },
  amtInput: { flex: 1, fontSize: 22, paddingVertical: spacing.sm, color: colors.textPrimary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.sm },
  dateLbl: { fontWeight: '700', fontSize: 13, color: colors.textSecondary, marginTop: 6, marginBottom: 4 },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, marginRight: spacing.sm, marginBottom: spacing.sm },
  chipActive: { backgroundColor: colors.primary },
  chipText: { fontSize: 13, color: colors.textSecondary },
  chipTextActive: { color: colors.textInverse, fontWeight: '600' },
});
