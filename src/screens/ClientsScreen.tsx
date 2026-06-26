import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, ActivityIndicator, Modal, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Card, SectionTitle, Button } from '../components/ui';
import { colors, spacing, radius, typography, shadow } from '../theme';
import { useAppState } from '../state/store';
import { useAuth } from '../state/auth';
import { getMyOrg, listFlaggedIndividualIds, listHouses, getMyHouseScope, House } from '../services/db';
import { ClientStatus } from '../types';
import { Paywall } from '../components/Paywall';
import { DEMO_CLIENTS } from '../data/demo';
import { ordinal } from '../utils/format';

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
    // House managers only see members in their assigned house(s).
    if (scope && !scope.isOwner && (!c.houseId || !scope.houseIds.includes(c.houseId))) return false;
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

  const add = async () => {
    if (!firstName.trim()) return;
    setBusy(true);
    try {
      const rentCents = rent ? Math.round(parseFloat(rent) * 100) : undefined;
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
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.houseFilterRow} contentContainerStyle={{ paddingHorizontal: spacing.md }}>
          <TouchableOpacity onPress={() => setHouseFilter('ALL')} style={[styles.houseChip, houseFilter === 'ALL' ? styles.houseChipOn : null]}>
            <Text style={[styles.houseChipText, houseFilter === 'ALL' ? styles.houseChipTextOn : null]}>All houses</Text>
          </TouchableOpacity>
          {houses.filter((h) => !scope || scope.isOwner || scope.houseIds.includes(h.id)).map((h) => (
            <TouchableOpacity key={h.id} onPress={() => setHouseFilter(h.id)} style={[styles.houseChip, houseFilter === h.id ? styles.houseChipOn : null]}>
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
        {!locked && !selectMode && !adding ? <Button title="+ Add member" onPress={() => setAdding(true)} /> : null}

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
    const cents = Math.round(parseFloat(amount || '0') * 100);
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
  empty: { ...typography.bodySecondary, textAlign: 'center', marginTop: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, ...shadow.card },
  check: { fontSize: 22, marginRight: spacing.md },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md },
  avatarText: { color: colors.textInverse, fontWeight: '700', fontSize: 18 },
  chevron: { fontSize: 28, color: colors.textMuted, marginLeft: spacing.sm },
  bulkBar: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  bulkText: { ...typography.body, fontWeight: '600' },
  bulkBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2 },
  bulkBtnText: { color: colors.textInverse, fontWeight: '700' },
  input: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, fontSize: 15, color: colors.textPrimary, marginBottom: spacing.sm },
  houseFilterRow: { marginBottom: spacing.sm, maxHeight: 44 },
  pickerLabel: { ...typography.caption, marginBottom: 4 },
  houseChips: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.sm },
  houseChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, marginRight: spacing.sm, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
  houseChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  houseChipText: { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
  houseChipTextOn: { color: colors.textInverse },
  cancel: { alignItems: 'center', paddingVertical: spacing.sm },
  cancelText: { color: colors.textSecondary },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: spacing.lg },
  modal: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md },
  amtRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceAlt, borderRadius: radius.md, paddingHorizontal: spacing.md, marginVertical: spacing.sm },
  dollar: { fontSize: 22, color: colors.textSecondary, marginRight: 4 },
  amtInput: { flex: 1, fontSize: 22, paddingVertical: spacing.sm, color: colors.textPrimary },
});
