import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Modal, Alert } from 'react-native';
import { Card, SectionTitle, Button } from './ui';
import { colors, spacing, radius, typography } from '../theme';
import {
  House, listHouses, createHouse, renameHouse, deleteHouse,
  listHouseStaff, assignManagerToHouse, removeManagerFromHouse, setHouseCapacity,
} from '../services/db';
import { Manager } from '../services/managers';

/**
 * Owner-only: manage the homes under this account. Create houses, share each
 * one's join code, and assign house managers to specific homes.
 */
export function HousesManager({ managers, isOwner = true }: { managers: Manager[]; isOwner?: boolean }) {
  const [houses, setHouses] = useState<House[]>([]);
  const [staff, setStaff] = useState<Record<string, string[]>>({}); // houseId -> profileIds
  const [expanded, setExpanded] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [capDraft, setCapDraft] = useState<Record<string, string>>({});
  const [nameDraft, setNameDraft] = useState<Record<string, string>>({});

  // Auto-save on blur — no Save button. Only writes when the value actually changed.
  const saveName = async (houseId: string) => {
    const v = (nameDraft[houseId] ?? '').trim();
    const current = houses.find((h) => h.id === houseId)?.name ?? '';
    if (!v || v === current) return;
    try {
      await renameHouse(houseId, v);
      setHouses((hs) => hs.map((h) => (h.id === houseId ? { ...h, name: v } : h)));
    } catch (e: any) { Alert.alert('Could not rename', e?.message ?? 'Try again.'); }
  };

  const saveCap = async (houseId: string) => {
    const raw = capDraft[houseId];
    if (raw === undefined) return; // field wasn't touched — don't overwrite
    const n = raw.trim() === '' ? null : parseInt(raw, 10);
    if (n != null && (isNaN(n) || n < 0)) { Alert.alert('Enter a number', 'Bed capacity must be a whole number.'); return; }
    const current = houses.find((h) => h.id === houseId)?.capacity ?? null;
    if (n === current) return;
    try { await setHouseCapacity(houseId, n); setHouses((hs) => hs.map((h) => h.id === houseId ? { ...h, capacity: n ?? undefined } : h)); }
    catch (e: any) { Alert.alert('Could not save', e?.message ?? 'Try again.'); }
  };

  const load = useCallback(async () => {
    try {
      const hs = await listHouses();
      setHouses(hs);
      const map: Record<string, string[]> = {};
      await Promise.all(hs.map(async (h) => { map[h.id] = await listHouseStaff(h.id).catch(() => []); }));
      setStaff(map);
    } catch { /* table may not exist until migration runs */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try { await createHouse(name.trim()); setName(''); setAddOpen(false); load(); }
    catch (e: any) { Alert.alert('Could not add house', e?.message ?? 'Try again.'); }
    finally { setBusy(false); }
  };

  const toggleManager = async (houseId: string, profileId: string, on: boolean) => {
    try {
      if (on) await assignManagerToHouse(houseId, profileId);
      else await removeManagerFromHouse(houseId, profileId);
      setStaff((s) => ({ ...s, [houseId]: on ? [...(s[houseId] || []), profileId] : (s[houseId] || []).filter((x) => x !== profileId) }));
    } catch (e: any) { Alert.alert('Could not update', e?.message ?? 'Try again.'); }
  };

  const removeHouse = (h: House) => {
    Alert.alert('Delete house?', `Remove “${h.name}”? Everyone in it will be moved to “no house” — they keep their accounts, data, and history; they just won't be assigned to a house. This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete house', style: 'destructive', onPress: async () => { await deleteHouse(h.id).catch((e: any) => Alert.alert('Could not delete', e?.message ?? 'Try again.')); setExpanded(null); load(); } },
    ]);
  };

  return (
    <>
      <SectionTitle>Houses</SectionTitle>
      <Card>
        <Text style={[typography.caption, { marginBottom: spacing.sm }]}>
          {isOwner
            ? 'Run multiple homes under one account. Each house has its own join code, members, and assigned managers.'
            : 'Assign house managers to the homes they oversee. Tap a house to choose who manages it.'}
        </Text>
        {houses.map((h) => {
          const open = expanded === h.id;
          const assigned = staff[h.id] || [];
          return (
            <View key={h.id} style={styles.house}>
              <TouchableOpacity style={styles.houseRow} onPress={() => setExpanded(open ? null : h.id)} onLongPress={() => isOwner && removeHouse(h)}>
                <View style={{ flex: 1 }}>
                  <Text style={[typography.body, { fontWeight: '700' }]}>{h.name}</Text>
                  <Text style={typography.caption}>Join code: <Text style={styles.code}>{h.joinCode}</Text> · {assigned.length} manager{assigned.length === 1 ? '' : 's'}</Text>
                </View>
                <Text style={styles.chev}>{open ? '▾' : '›'}</Text>
              </TouchableOpacity>
              {open ? (
                <View style={styles.assignArea}>
                  {isOwner ? (
                  <>
                  <Text style={[typography.caption, { fontWeight: '700', marginBottom: 4 }]}>House name</Text>
                  <TextInput
                    style={styles.capInput}
                    defaultValue={h.name}
                    onChangeText={(t) => setNameDraft((d) => ({ ...d, [h.id]: t }))}
                    onBlur={() => saveName(h.id)}
                    placeholder="House name"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="words"
                  />
                  <Text style={[typography.caption, { fontWeight: '700', marginBottom: 4, marginTop: spacing.sm }]}>Bed capacity</Text>
                  <TextInput
                    style={styles.capInput}
                    defaultValue={h.capacity != null ? String(h.capacity) : ''}
                    onChangeText={(t) => setCapDraft((d) => ({ ...d, [h.id]: t }))}
                    onBlur={() => saveCap(h.id)}
                    placeholder="# beds"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="number-pad"
                  />
                  <Text style={[typography.caption, { color: colors.textMuted, marginTop: 4 }]}>Changes save automatically.</Text>
                  </>
                  ) : null}
                  <Text style={[typography.caption, { fontWeight: '700', marginBottom: 4, marginTop: spacing.sm }]}>Assign house managers</Text>
                  {managers.length === 0 ? (
                    <Text style={typography.caption}>{isOwner ? 'Add house managers first (below), then assign them here.' : 'No house managers have been added yet. Ask the owner to add one.'}</Text>
                  ) : managers.map((m) => {
                    const on = assigned.includes(m.id);
                    return (
                      <TouchableOpacity key={m.id} style={styles.mgrToggle} onPress={() => toggleManager(h.id, m.id, !on)}>
                        <View style={[styles.box, on ? styles.boxOn : null]}>{on ? <Text style={styles.boxCheck}>✓</Text> : null}</View>
                        <Text style={typography.body}>{m.name || m.email}</Text>
                      </TouchableOpacity>
                    );
                  })}
                  {isOwner ? (
                    <TouchableOpacity onPress={() => removeHouse(h)} style={styles.deleteHouseBtn}>
                      <Text style={styles.deleteHouseText}>🗑  Delete this house</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        })}
        {isOwner ? <Button title="➕ Add a house" variant="secondary" onPress={() => setAddOpen(true)} /> : null}
      </Card>

      <Modal visible={addOpen} transparent animationType="fade" onRequestClose={() => setAddOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.modal}>
            <Text style={typography.h3}>New house</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="House name (e.g. Hillside House)" placeholderTextColor={colors.textMuted} autoCapitalize="words" />
            <Button title={busy ? 'Adding…' : 'Create house'} onPress={add} disabled={busy || !name.trim()} />
            <TouchableOpacity onPress={() => setAddOpen(false)} style={{ alignItems: 'center', paddingVertical: spacing.sm }}><Text style={{ color: colors.textSecondary }}>Cancel</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  house: { borderBottomWidth: 1, borderBottomColor: colors.divider, marginBottom: spacing.sm, paddingBottom: spacing.sm },
  houseRow: { flexDirection: 'row', alignItems: 'center' },
  code: { fontWeight: '800', letterSpacing: 1, color: colors.primaryDark },
  chev: { fontSize: 20, color: colors.textMuted, marginLeft: spacing.sm },
  deleteHouseBtn: { marginTop: spacing.md, paddingVertical: spacing.sm, alignItems: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: colors.crisis },
  deleteHouseText: { color: colors.crisis, fontWeight: '700', fontSize: 14 },
  assignArea: { marginTop: spacing.sm, paddingLeft: spacing.sm },
  mgrToggle: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  box: { width: 22, height: 22, borderRadius: 5, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm },
  boxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  boxCheck: { color: colors.textInverse, fontWeight: '800', fontSize: 13 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: spacing.lg },
  modal: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md },
  input: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, fontSize: 16, color: colors.textPrimary, marginVertical: spacing.md },
  capRow: { flexDirection: 'row', alignItems: 'center' },
  capInput: { alignSelf: 'stretch', backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.sm, fontSize: 15, color: colors.textPrimary },
  capSave: { backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  capSaveText: { color: colors.textInverse, fontWeight: '700' },
});
