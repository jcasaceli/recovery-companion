import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, ActivityIndicator, Modal, ScrollView, Platform, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Card, SectionTitle, Button } from '../components/ui';
import { colors, spacing, radius, typography, shadow } from '../theme';
import { useAppState } from '../state/store';
import { useAuth } from '../state/auth';
import { getMyOrg, listFlaggedIndividualIds, listHouses, getMyHouseScope, House, listFacilitatorIndividuals, listOrgCheckins, listOrgPayments, getAvatarUrls } from '../services/db';
import { ClientStatus } from '../types';
import { Paywall } from '../components/Paywall';
import { DEMO_CLIENTS } from '../data/demo';
import { ordinal, parseMoneyCents } from '../utils/format';
import { toCsv, downloadCsv, pickCsvText, parseCsv, rowsToMembers } from '../utils/csv';

function money(cents?: number) {
  return cents ? `$${(cents / 100).toFixed(2)}` : 'No fee set';
}

export function ClientsScreen() {
  const { clients, createClient, setRent, subscriptionActive, reloadCloud } = useAppState();
  const locked = !subscriptionActive;
  const auth = useAuth();
  const nav = useNavigation<any>();
  const [org, setOrg] = useState<{ name?: string; join_code?: string } | null>(null);

  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [avatars, setAvatars] = useState<Record<string, string>>({}); // path -> signed url
  useEffect(() => {
    const paths = clients.map((c) => c.avatarPath).filter(Boolean) as string[];
    if (!paths.length) { setAvatars({}); return; }
    getAvatarUrls(paths).then(setAvatars).catch(() => {});
  }, [clients]);
  // Web gets a yearbook-style photo gallery; the phone app keeps the compact list.
  const isWeb = Platform.OS === 'web';
  const [houses, setHouses] = useState<House[]>([]);
  const [scope, setScope] = useState<{ isOwner: boolean; houseIds: string[] } | null>(null);
  const [houseFilter, setHouseFilter] = useState<string | 'ALL'>('ALL'); // owner can filter
  const [addHouseId, setAddHouseId] = useState<string | undefined>(undefined);
  useEffect(() => {
    getMyOrg().then((o: any) => o && setOrg({ name: o.name, join_code: o.join_code })).catch(() => {});
    listFlaggedIndividualIds().then((ids) => setFlagged(new Set(ids))).catch(() => {});
    listHouses().then(setHouses).catch(() => {});
    getMyHouseScope().then(setScope).catch(() => {});
  }, []);
  const houseLabel = (id?: string) => houses.find((h) => h.id === id)?.name;
  const [filter, setFilter] = useState<ClientStatus>('in_care');
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  // multi-select
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [bulkOpen, setBulkOpen] = useState(false);

  // add-form
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [rent, setRentValue] = useState('');
  const [dueDay, setDueDay] = useState('');

  // Preview mode shows sample residents until the org subscribes.
  const sourceClients = (locked ? DEMO_CLIENTS : clients).filter((c) => {
    if (locked) return true;
    // House managers see everyone by default (full access, same as the owner).
    // Only when explicitly assigned to specific house(s) are they scoped to those.
    if (scope && !scope.isOwner && scope.houseIds.length > 0 && (!c.houseId || !scope.houseIds.includes(c.houseId))) return false;
    // Owner can filter to one house.
    if (houseFilter !== 'ALL' && c.houseId !== houseFilter) return false;
    return true;
  });
  const shown = sourceClients.filter((c) => c.status === filter);
  const counts = {
    in_care: sourceClients.filter((c) => c.status === 'in_care').length,
    completed: sourceClients.filter((c) => c.status === 'completed').length,
  };
  const selectedIds = Object.keys(selected).filter((id) => selected[id]);

  const [importing, setImporting] = useState(false);
  const onWeb = Platform.OS === 'web';

  const [exporting, setExporting] = useState(false);
  const exportMembers = async () => {
    setExporting(true);
    try {
      // Full records + all-time meeting check-ins + payments for a rich export.
      const [rowsRaw, checkins, pays] = await Promise.all([
        listFacilitatorIndividuals().catch(() => [] as any[]),
        listOrgCheckins('1970-01-01T00:00:00Z').catch(() => [] as { individualId: string; createdAt: string }[]),
        listOrgPayments().catch(() => [] as any[]),
      ]);
      const byId: Record<string, { count: number; last?: string }> = {};
      for (const c of checkins) {
        const e = byId[c.individualId] || { count: 0 };
        e.count += 1;
        if (!e.last || c.createdAt > e.last) e.last = c.createdAt;
        byId[c.individualId] = e;
      }
      const paidById: Record<string, number> = {};
      for (const p of pays as any[]) {
        if (p.status === 'paid') paidById[p.individualId] = (paidById[p.individualId] || 0) + (p.amountCents || 0);
      }
      const d = (s?: string) => (s ? String(s).slice(0, 10) : '');
      const headers = [
        'First Name', 'Last Name', 'Phone', 'Email', 'House', 'Bed', 'Status', 'Level of Care',
        'Monthly Fee', 'Rent Due Day', 'Total Paid to Date', 'Move-in Date', 'Discharge Date', 'Sobriety Date',
        'Program', 'Meeting Check-ins', 'Last Check-in', 'Join Code',
      ];
      const rows = (rowsRaw as any[]).map((r) => {
        const ci = byId[r.id] || { count: 0 };
        return [
          r.first_name ?? '', r.last_name ?? '', r.phone ?? '', r.email ?? '',
          houseLabel(r.house_id) ?? r.house_name ?? '', r.bed_label ?? '',
          r.status === 'completed' ? 'Completed' : 'In Care', r.level_of_care ?? '',
          r.monthly_rent_cents != null ? (r.monthly_rent_cents / 100).toFixed(2) : '',
          r.rent_due_day ?? '', ((paidById[r.id] || 0) / 100).toFixed(2),
          d(r.move_in_date), d(r.discharge_date), d(r.sobriety_date),
          r.program_name ?? '', ci.count, ci.last ? new Date(ci.last).toISOString().slice(0, 10) : '',
          r.join_code ?? '',
        ];
      });
      downloadCsv(`members-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(headers, rows));
    } catch (e: any) { Alert.alert('Export', e?.message ?? 'Could not export.'); }
    finally { setExporting(false); }
  };

  // One row per payment — QuickBooks-friendly transaction list.
  const exportPayments = async () => {
    setExporting(true);
    try {
      const [pays, rowsRaw] = await Promise.all([
        listOrgPayments().catch(() => [] as any[]),
        listFacilitatorIndividuals().catch(() => [] as any[]),
      ]);
      const nameById: Record<string, string> = {};
      (rowsRaw as any[]).forEach((r) => { nameById[r.id] = `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim(); });
      const headers = ['Date', 'Member', 'Amount', 'Method', 'Status', 'Period', 'On Time'];
      const rows = (pays as any[]).map((p) => [
        p.paidAt ? new Date(p.paidAt).toISOString().slice(0, 10) : '',
        nameById[p.individualId] || p.memberName || '',
        ((p.amountCents || 0) / 100).toFixed(2),
        p.method ?? '',
        p.status === 'reported' ? 'Reported' : 'Paid',
        p.periodMonth ?? '',
        p.onTime === true ? 'Yes' : p.onTime === false ? 'No' : '',
      ]);
      if (!rows.length) { Alert.alert('No payments', 'There are no payments to export yet.'); return; }
      downloadCsv(`payments-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(headers, rows));
    } catch (e: any) { Alert.alert('Export', e?.message ?? 'Could not export.'); }
    finally { setExporting(false); }
  };

  const importMembers = async () => {
    try {
      const text = await pickCsvText();
      if (!text) return;
      const members = rowsToMembers(parseCsv(text));
      if (!members.length) { Alert.alert('Nothing to import', 'No names were found. Make sure there is a name column.'); return; }
      const go = async () => {
        setImporting(true);
        let ok = 0; let fail = 0;
        for (const m of members) {
          try { await createClient({ firstName: m.firstName, lastName: m.lastName, phone: m.phone, email: m.email, houseId: addHouseId }); ok++; }
          catch { fail++; }
        }
        await reloadCloud();
        setImporting(false);
        Alert.alert('Import complete ✅', `Added ${ok} member${ok === 1 ? '' : 's'}${fail ? ` · ${fail} failed` : ''}.`);
      };
      Alert.alert('Import members', `Found ${members.length} member${members.length === 1 ? '' : 's'} to add. Continue?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Import', onPress: go },
      ]);
    } catch (e: any) { Alert.alert('Import', e?.message ?? 'Could not read that file.'); }
  };

  const add = async () => {
    if (!firstName.trim()) return;
    setBusy(true);
    try {
      const rentCents = parseMoneyCents(rent) ?? undefined;
      const day = dueDay ? Math.min(31, Math.max(1, parseInt(dueDay, 10))) : undefined;
      await createClient({
        firstName,
        lastName: lastName || undefined,
        houseId: addHouseId,
        phone: phone || undefined,
        email: email || undefined,
        monthlyRentCents: rentCents,
        rentDueDay: day,
        levelOfCare: 'sober_living',
      });
      setFirstName(''); setLastName(''); setPhone(''); setEmail(''); setRentValue(''); setDueDay('');
      setAdding(false); setFilter('in_care');
    } catch (e: any) {
      Alert.alert('Could not add member', e?.message ?? 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const toggleSel = (id: string) => setSelected((s) => ({ ...s, [id]: !s[id] }));
  const exitSelect = () => { setSelectMode(false); setSelected({}); };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.adminBar}>
        <View style={{ flex: 1 }}>
          <Text style={styles.adminTitle}>{org?.name || 'My Sober Living'}</Text>
          <Text style={styles.adminSub}>
            Admin · {auth.profile?.fullName ?? auth.profile?.email ?? ''}
          </Text>
        </View>
        {!locked ? (
          <TouchableOpacity onPress={() => (selectMode ? exitSelect() : setSelectMode(true))}>
            <Text style={styles.selectToggle}>{selectMode ? 'Cancel' : 'Select'}</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {!locked && org?.join_code ? (
        <TouchableOpacity
          style={styles.codeBar}
          onPress={() => Alert.alert('Master join code', `Share this ONE code with all your residents. They download the app, sign up, and enter it to join ${org?.name || 'your sober living'}. If you have more than one house, they'll pick their house after entering the code:\n\n${org.join_code}`)}
        >
          <Text style={styles.codeText}>Master join code: <Text style={styles.codeStrong}>{org.join_code}</Text></Text>
          <Text style={styles.codeHint}>tap for details · one code for everyone</Text>
        </TouchableOpacity>
      ) : null}

      {!locked && houses.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.houseFilterRow} contentContainerStyle={styles.houseFilterContent}>
          <TouchableOpacity onPress={() => setHouseFilter('ALL')} style={[styles.houseChip, styles.filterChip, houseFilter === 'ALL' ? styles.houseChipOn : null]}>
            <Text style={[styles.houseChipText, houseFilter === 'ALL' ? styles.houseChipTextOn : null]}>All houses</Text>
          </TouchableOpacity>
          {houses.filter((h) => !scope || scope.isOwner || scope.houseIds.includes(h.id)).map((h) => (
            <TouchableOpacity key={h.id} onPress={() => setHouseFilter(h.id)} style={[styles.houseChip, styles.filterChip, houseFilter === h.id ? styles.houseChipOn : null]}>
              <Text style={[styles.houseChipText, houseFilter === h.id ? styles.houseChipTextOn : null]}>{h.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : null}

      <View style={styles.filters}>
        <FilterTab label={`In Care (${counts.in_care})`} active={filter === 'in_care'} onPress={() => setFilter('in_care')} />
        <FilterTab label={`Completed (${counts.completed})`} active={filter === 'completed'} onPress={() => setFilter('completed')} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {locked ? <Paywall onChanged={reloadCloud} /> : null}
        {!locked && !selectMode && !adding ? (
          <>
            <Button title="+ Add member" onPress={() => setAdding(true)} />
            {onWeb ? (
              <View style={styles.ioRow}>
                <View style={{ flex: 1, marginRight: spacing.sm }}>
                  <Button title={importing ? 'Importing…' : '⬆️ Import CSV'} variant="secondary" onPress={importMembers} disabled={importing} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button title={exporting ? 'Exporting…' : '⬇️ Export CSV'} variant="secondary" onPress={exportMembers} disabled={exporting || !clients.length} />
                </View>
              </View>
            ) : null}
            {onWeb ? (
              <View style={[styles.ioRow, { marginTop: 0 }]}>
                <View style={{ flex: 1 }}>
                  <Button title={exporting ? 'Exporting…' : '💵 Export payments (QuickBooks)'} variant="secondary" onPress={exportPayments} disabled={exporting} />
                </View>
              </View>
            ) : null}
          </>
        ) : null}

        {adding ? (
          <Card>
            <SectionTitle>New member</SectionTitle>
            <TextInput style={styles.input} value={firstName} onChangeText={setFirstName} placeholder="First name" placeholderTextColor={colors.textMuted} autoCapitalize="words" />
            <TextInput style={styles.input} value={lastName} onChangeText={setLastName} placeholder="Last name" placeholderTextColor={colors.textMuted} autoCapitalize="words" />
            {houses.length ? (
              <>
                <Text style={styles.pickerLabel}>House</Text>
                <View style={styles.houseChips}>
                  {houses.map((h) => (
                    <TouchableOpacity key={h.id} onPress={() => setAddHouseId(h.id)} style={[styles.houseChip, addHouseId === h.id ? styles.houseChipOn : null]}>
                      <Text style={[styles.houseChipText, addHouseId === h.id ? styles.houseChipTextOn : null]}>{h.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            ) : null}
            <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="Phone (optional — to text an app invite)" placeholderTextColor={colors.textMuted} keyboardType="phone-pad" />
            <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="Email (optional)" placeholderTextColor={colors.textMuted} keyboardType="email-address" autoCapitalize="none" />
            <TextInput style={styles.input} value={rent} onChangeText={setRentValue} placeholder="Monthly membership fee (optional, e.g. 800)" placeholderTextColor={colors.textMuted} keyboardType="decimal-pad" />
            <TextInput style={styles.input} value={dueDay} onChangeText={setDueDay} placeholder="Rent due day 1–31 (optional)" placeholderTextColor={colors.textMuted} keyboardType="number-pad" />
            <Button title="Add" onPress={add} disabled={!firstName.trim() || busy} />
            <TouchableOpacity onPress={() => setAdding(false)} style={styles.cancel}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
            {busy ? <ActivityIndicator color={colors.primary} /> : null}
          </Card>
        ) : null}

        {shown.length === 0 ? (
          <Text style={styles.empty}>{filter === 'in_care' ? 'No members in care yet.' : 'No completed members yet.'}</Text>
        ) : isWeb ? (
          <View style={styles.grid}>
            {shown.map((c) => (
              <TouchableOpacity
                key={c.id}
                style={styles.tile}
                activeOpacity={0.75}
                onPress={() => (selectMode && !locked ? toggleSel(c.id) : nav.navigate('ClientProfile', { id: c.id }))}
              >
                <View style={styles.tilePhotoWrap}>
                  {c.avatarPath && avatars[c.avatarPath] ? (
                    <Image source={{ uri: avatars[c.avatarPath] }} style={styles.tilePhoto} />
                  ) : (
                    <View style={[styles.tilePhoto, styles.tileFallback]}>
                      <Text style={styles.tileInitial}>{c.firstName.charAt(0).toUpperCase()}</Text>
                    </View>
                  )}
                  {selectMode ? <Text style={[styles.tileBadge, styles.tileCheck]}>{selected[c.id] ? '☑️' : '⬜️'}</Text> : null}
                  {flagged.has(c.id) ? <Text style={[styles.tileBadge, styles.tileFlag]}>🚩</Text> : null}
                </View>
                <Text style={styles.tileName} numberOfLines={1}>{c.firstName}{c.lastName ? ` ${c.lastName}` : ''}</Text>
                <Text style={styles.tileMeta} numberOfLines={1}>{houseLabel(c.houseId) || c.houseName || 'Sober Living'}</Text>
                {c.tags && c.tags.length ? <Text style={styles.tileTags} numberOfLines={2}>{c.tags.join(' · ')}</Text> : null}
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          shown.map((c) => (
            <TouchableOpacity
              key={c.id}
              style={styles.row}
              activeOpacity={0.7}
              onPress={() =>
                selectMode && !locked
                  ? toggleSel(c.id)
                  : nav.navigate('ClientProfile', { id: c.id })
              }
            >
              {selectMode ? (
                <Text style={styles.check}>{selected[c.id] ? '☑️' : '⬜️'}</Text>
              ) : c.avatarPath && avatars[c.avatarPath] ? (
                <Image source={{ uri: avatars[c.avatarPath] }} style={styles.avatar} />
              ) : (
                <View style={styles.avatar}><Text style={styles.avatarText}>{c.firstName.charAt(0).toUpperCase()}</Text></View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={typography.h3}>
                  {c.firstName}{c.lastName ? ` ${c.lastName}` : ''}{flagged.has(c.id) ? '  🚩' : ''}
                </Text>
                <Text style={typography.caption}>
                  {houseLabel(c.houseId) || c.houseName ? `${houseLabel(c.houseId) || c.houseName} · ` : ''}Fee: {money(c.monthlyRentCents)}{c.rentDueDay ? ` · due the ${ordinal(c.rentDueDay)}` : ''}
                </Text>
                {c.tags && c.tags.length ? <Text style={styles.rowTags} numberOfLines={1}>{c.tags.join(' · ')}</Text> : null}
              </View>
              {!selectMode ? <Text style={styles.chevron}>›</Text> : null}
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {/* Bulk action bar */}
      {selectMode ? (
        <View style={styles.bulkBar}>
          <Text style={styles.bulkText}>{selectedIds.length} selected</Text>
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            style={[styles.bulkBtn, selectedIds.length === 0 ? { opacity: 0.4 } : null]}
            disabled={selectedIds.length === 0}
            onPress={() => setBulkOpen(true)}
          >
            <Text style={styles.bulkBtnText}>Set membership fee for {selectedIds.length}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <BulkRentModal
        visible={bulkOpen}
        count={selectedIds.length}
        onClose={() => setBulkOpen(false)}
        onSave={async (cents, day) => {
          for (const id of selectedIds) await setRent(id, cents, day);
          setBulkOpen(false);
          exitSelect();
        }}
      />
    </SafeAreaView>
  );
}

function BulkRentModal({ visible, count, onClose, onSave }: { visible: boolean; count: number; onClose: () => void; onSave: (cents: number, day: number | null) => Promise<void> }) {
  const [amount, setAmount] = useState('');
  const [dueDay, setDueDay] = useState('');
  const [busy, setBusy] = useState(false);
  if (!visible) return null;
  const save = async () => {
    const cents = parseMoneyCents(amount);
    if (!cents) { Alert.alert('Enter an amount'); return; }
    const day = dueDay ? Math.min(31, Math.max(1, parseInt(dueDay, 10))) : null;
    setBusy(true);
    try { await onSave(cents, day); setAmount(''); setDueDay(''); } finally { setBusy(false); }
  };
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <Text style={typography.h3}>Set membership fee for {count} client{count === 1 ? '' : 's'}</Text>
          <View style={styles.amtRow}><Text style={styles.dollar}>$</Text>
            <TextInput style={styles.amtInput} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.textMuted} />
          </View>
          <TextInput style={styles.input} value={dueDay} onChangeText={setDueDay} keyboardType="number-pad" placeholder="Due day of month (1–31)" placeholderTextColor={colors.textMuted} />
          <Button title="Apply to all selected" onPress={save} disabled={busy} />
          <TouchableOpacity onPress={onClose} style={styles.cancel}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function FilterTab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.filter, active ? styles.filterActive : null]}>
      <Text style={[styles.filterText, active ? styles.filterTextActive : null]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  adminBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primaryDark, padding: spacing.md, margin: spacing.md, marginBottom: spacing.sm, borderRadius: radius.md },
  adminTitle: { fontSize: 22, fontWeight: '800', color: colors.textInverse },
  adminSub: { fontSize: 12, color: colors.primaryLight, marginTop: 2 },
  selectToggle: { color: colors.textInverse, fontWeight: '700' },
  codeBar: { backgroundColor: colors.accentLight, borderRadius: radius.md, marginHorizontal: spacing.md, marginBottom: spacing.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  codeText: { ...typography.body, color: colors.textPrimary },
  codeStrong: { fontWeight: '800', letterSpacing: 1 },
  codeHint: { ...typography.caption },
  filters: { flexDirection: 'row', paddingHorizontal: spacing.md, marginBottom: spacing.sm },
  filter: { flex: 1, paddingVertical: spacing.sm, alignItems: 'center', borderRadius: radius.pill, backgroundColor: colors.surface, marginRight: spacing.sm, borderWidth: 1, borderColor: colors.border },
  filterActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { color: colors.textSecondary, fontWeight: '600', fontSize: 13 },
  filterTextActive: { color: colors.textInverse },
  scroll: { padding: spacing.md, paddingBottom: spacing.xxl },
  ioRow: { flexDirection: 'row', marginTop: spacing.sm },
  empty: { ...typography.bodySecondary, textAlign: 'center', marginTop: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, ...shadow.card },
  check: { fontSize: 22, marginRight: spacing.md },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md },
  // Web yearbook gallery
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, paddingHorizontal: spacing.md, paddingBottom: spacing.md },
  tile: { width: 158, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: spacing.sm, ...shadow.card },
  tilePhotoWrap: { position: 'relative' },
  tilePhoto: { width: '100%', aspectRatio: 1, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  tileFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryLight },
  tileInitial: { fontSize: 46, fontWeight: '800', color: colors.primary },
  tileBadge: { position: 'absolute', fontSize: 18 },
  tileCheck: { top: 6, left: 6 },
  tileFlag: { top: 6, right: 6 },
  tileName: { ...typography.body, fontWeight: '700', marginTop: spacing.sm },
  tileMeta: { ...typography.caption, color: colors.textMuted },
  tileTags: { fontSize: 11, color: colors.primaryDark, marginTop: 3, lineHeight: 14 },
  rowTags: { fontSize: 11, color: colors.primaryDark, marginTop: 1 },
  avatarText: { color: colors.textInverse, fontWeight: '700', fontSize: 18 },
  chevron: { fontSize: 28, color: colors.textMuted, marginLeft: spacing.sm },
  bulkBar: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  bulkText: { ...typography.body, fontWeight: '600' },
  bulkBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2 },
  bulkBtnText: { color: colors.textInverse, fontWeight: '700' },
  input: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, fontSize: 15, color: colors.textPrimary, marginBottom: spacing.sm },
  houseFilterRow: { marginBottom: spacing.sm, flexGrow: 0 },
  houseFilterContent: { paddingHorizontal: spacing.md, alignItems: 'center' },
  filterChip: { marginBottom: 0 },
  pickerLabel: { ...typography.caption, marginBottom: 4 },
  houseChips: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.sm },
  houseChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, marginRight: spacing.sm, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
  houseChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  houseChipText: { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
  houseChipTextOn: { color: '#FFFFFF', fontWeight: '800' },
  cancel: { alignItems: 'center', paddingVertical: spacing.sm },
  cancelText: { color: colors.textSecondary },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: spacing.lg },
  modal: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md },
  amtRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceAlt, borderRadius: radius.md, paddingHorizontal: spacing.md, marginVertical: spacing.sm },
  dollar: { fontSize: 22, color: colors.textSecondary, marginRight: 4 },
  amtInput: { flex: 1, fontSize: 22, paddingVertical: spacing.sm, color: colors.textPrimary },
});
