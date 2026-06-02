import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, ActivityIndicator, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView } from 'react-native';
import { Card, SectionTitle, Button } from '../components/ui';
import { colors, spacing, radius, typography, shadow } from '../theme';
import { useAppState } from '../state/store';
import { useAuth } from '../state/auth';
import { ClientStatus, LevelOfCare } from '../types';
import { LEVELS_OF_CARE, LEVEL_OF_CARE_LABELS } from '../utils/format';

export function ClientsScreen() {
  const { clients, createClient, selectClient, setClientStatus, setClientLevel } = useAppState();
  const auth = useAuth();
  const [filter, setFilter] = useState<ClientStatus>('in_care');
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  // add-form fields
  const [firstName, setFirstName] = useState('');
  const [programName, setProgramName] = useState('');
  const [orgName, setOrgName] = useState('');
  const [level, setLevel] = useState<LevelOfCare | null>(null);

  // change-level modal
  const [levelEditId, setLevelEditId] = useState<string | null>(null);

  const shown = clients.filter((c) => c.status === filter);
  const counts = {
    in_care: clients.filter((c) => c.status === 'in_care').length,
    completed: clients.filter((c) => c.status === 'completed').length,
  };

  // Group the shown clients by level of care, in canonical order, with an
  // "Unassigned" bucket last.
  const groups: { key: string; label: string; items: typeof shown }[] = [];
  for (const lvl of LEVELS_OF_CARE) {
    const items = shown.filter((c) => c.levelOfCare === lvl);
    if (items.length) groups.push({ key: lvl, label: LEVEL_OF_CARE_LABELS[lvl], items });
  }
  const unassigned = shown.filter((c) => !c.levelOfCare);
  if (unassigned.length) groups.push({ key: 'none', label: 'Unassigned', items: unassigned });

  const add = async () => {
    if (!firstName.trim()) return;
    setBusy(true);
    try {
      await createClient({
        firstName,
        programName: programName || undefined,
        orgName: orgName || undefined,
        levelOfCare: level || undefined,
      });
      setFirstName(''); setProgramName(''); setLevel(null);
      setAdding(false); setFilter('in_care');
    } catch (e: any) {
      Alert.alert('Could not add client', e?.message ?? 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      {/* Admin console banner — signals the facilitator/admin account */}
      <View style={styles.adminBar}>
        <View style={{ flex: 1 }}>
          <Text style={styles.adminTitle}>Facilitator Console</Text>
          <Text style={styles.adminSub}>
            {auth.profile?.fullName ? `Signed in as ${auth.profile.fullName}` : 'Manage your clients'}
          </Text>
        </View>
        <View style={styles.adminBadge}>
          <Text style={styles.adminBadgeText}>ADMIN</Text>
        </View>
      </View>

      <View style={styles.filters}>
        <FilterTab label={`In Care (${counts.in_care})`} active={filter === 'in_care'} onPress={() => setFilter('in_care')} />
        <FilterTab label={`Completed (${counts.completed})`} active={filter === 'completed'} onPress={() => setFilter('completed')} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {!adding ? (
          <Button title="+ Add client" onPress={() => setAdding(true)} />
        ) : (
          <Card>
            <SectionTitle>New client</SectionTitle>
            <Input value={firstName} onChange={setFirstName} placeholder="Client's first name" />
            <Input value={programName} onChange={setProgramName} placeholder="Program name (optional)" />
            <Input value={orgName} onChange={setOrgName} placeholder="Your organization (optional)" />
            <Text style={styles.label}>Level of care</Text>
            <View style={styles.chips}>
              {LEVELS_OF_CARE.map((l) => (
                <TouchableOpacity
                  key={l}
                  onPress={() => setLevel(l)}
                  style={[styles.chip, level === l ? styles.chipActive : null]}
                >
                  <Text style={[styles.chipText, level === l ? styles.chipTextActive : null]}>
                    {LEVEL_OF_CARE_LABELS[l]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Button title="Add" onPress={add} disabled={!firstName.trim() || busy} />
            <TouchableOpacity onPress={() => setAdding(false)} style={styles.cancel}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            {busy ? <ActivityIndicator color={colors.primary} /> : null}
          </Card>
        )}

        {groups.length === 0 ? (
          <Text style={styles.empty}>
            {filter === 'in_care' ? 'No clients in care yet.' : 'No completed clients yet.'}
          </Text>
        ) : (
          groups.map((g) => (
            <View key={g.key}>
              <Text style={styles.groupHeader}>{g.label} · {g.items.length}</Text>
              {g.items.map((c) => (
                <View key={c.id} style={styles.row}>
                  <TouchableOpacity style={styles.rowMain} activeOpacity={0.7} onPress={() => selectClient(c.id)}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{c.firstName.charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={typography.h3}>{c.firstName}</Text>
                      <Text style={typography.caption}>
                        {c.levelOfCare ? LEVEL_OF_CARE_LABELS[c.levelOfCare] : 'No level set'}
                        {c.programName ? ` · ${c.programName}` : ''}
                      </Text>
                    </View>
                  </TouchableOpacity>
                  <View style={styles.rowActions}>
                    <TouchableOpacity onPress={() => setLevelEditId(c.id)} style={styles.miniBtn} hitSlop={6}>
                      <Text style={styles.miniBtnText}>Level</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setClientStatus(c.id, c.status === 'in_care' ? 'completed' : 'in_care')}
                      style={styles.miniBtn}
                      hitSlop={6}
                    >
                      <Text style={styles.miniBtnText}>{c.status === 'in_care' ? 'Complete' : 'Reactivate'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          ))
        )}
      </ScrollView>

      {/* Change-level modal */}
      <Modal visible={levelEditId !== null} transparent animationType="fade" onRequestClose={() => setLevelEditId(null)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setLevelEditId(null)}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Set level of care</Text>
            {LEVELS_OF_CARE.map((l) => (
              <TouchableOpacity
                key={l}
                style={styles.modalOption}
                onPress={() => {
                  if (levelEditId) setClientLevel(levelEditId, l);
                  setLevelEditId(null);
                }}
              >
                <Text style={styles.modalOptionText}>{LEVEL_OF_CARE_LABELS[l]}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

function FilterTab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.filter, active ? styles.filterActive : null]}>
      <Text style={[styles.filterText, active ? styles.filterTextActive : null]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Input({ value, onChange, placeholder }: { value: string; onChange: (s: string) => void; placeholder: string }) {
  return (
    <TextInput
      style={styles.input}
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={colors.textMuted}
      autoCapitalize="words"
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  adminBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryDark,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    margin: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: radius.md,
  },
  adminTitle: { fontSize: 20, fontWeight: '800', color: colors.textInverse },
  adminSub: { fontSize: 12, color: colors.primaryLight, marginTop: 2 },
  adminBadge: { backgroundColor: colors.accent, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  adminBadgeText: { color: colors.textInverse, fontWeight: '800', fontSize: 12, letterSpacing: 1 },
  filters: { flexDirection: 'row', paddingHorizontal: spacing.md, marginBottom: spacing.sm },
  filter: { flex: 1, paddingVertical: spacing.sm, alignItems: 'center', borderRadius: radius.pill, backgroundColor: colors.surface, marginRight: spacing.sm, borderWidth: 1, borderColor: colors.border },
  filterActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { color: colors.textSecondary, fontWeight: '600', fontSize: 13 },
  filterTextActive: { color: colors.textInverse },
  scroll: { padding: spacing.md, paddingBottom: spacing.xxl },
  empty: { ...typography.bodySecondary, textAlign: 'center', marginTop: spacing.lg },
  groupHeader: { ...typography.caption, fontWeight: '700', color: colors.primary, marginTop: spacing.md, marginBottom: spacing.xs, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.sm + 2, marginBottom: spacing.sm, ...shadow.card },
  rowMain: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  rowActions: { alignItems: 'flex-end' },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm },
  avatarText: { color: colors.textInverse, fontWeight: '700', fontSize: 17 },
  miniBtn: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt, marginBottom: 4 },
  miniBtnText: { fontSize: 11, color: colors.primary, fontWeight: '600' },
  label: { ...typography.bodySecondary, fontWeight: '600', marginBottom: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, marginRight: spacing.sm, marginBottom: spacing.sm },
  chipActive: { backgroundColor: colors.primary },
  chipText: { fontSize: 13, color: colors.textSecondary },
  chipTextActive: { color: colors.textInverse, fontWeight: '600' },
  input: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, fontSize: 15, color: colors.textPrimary, marginBottom: spacing.sm },
  cancel: { alignItems: 'center', paddingVertical: spacing.sm },
  cancelText: { color: colors.textSecondary },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: spacing.lg },
  modalCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md },
  modalTitle: { ...typography.h3, marginBottom: spacing.sm },
  modalOption: { paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
  modalOptionText: { ...typography.body },
});
