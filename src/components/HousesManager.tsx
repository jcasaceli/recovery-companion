import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Modal, Alert } from 'react-native';
import { Card, SectionTitle, Button } from './ui';
import { colors, spacing, radius, typography } from '../theme';
import {
  House, listHouses, createHouse, renameHouse, deleteHouse,
  listHouseStaff, assignManagerToHouse, removeManagerFromHouse,
} from '../services/db';
import { Manager } from '../services/managers';

/**
 * Owner-only: manage the homes under this account. Create houses, share each
 * one's join code, and assign house managers to specific homes.
 */
export function HousesManager({ managers }: { managers: Manager[] }) {
  const [houses, setHouses] = useState<House[]>([]);
  const [staff, setStaff] = useState<Record<string, string[]>>({}); // houseId -> profileIds
  const [expanded, setExpanded] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

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
    Alert.alert('Delete house?', `Remove “${h.name}”? Members in it will become unassigned. This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await deleteHouse(h.id).catch(() => {}); load(); } },
    ]);
  };

  return (
    <>
      <SectionTitle>Houses</SectionTitle>
      <Card>
        <Text style={[typography.caption, { marginBottom: spacing.sm }]}>
          Run multiple homes under one account. Each house has its own join code, members, and assigned managers.
        </Text>
        {houses.map((h) => {
          const open = expanded === h.id;
          const assigned = staff[h.id] || [];
          return (
            <View key={h.id} style={styles.house}>
              <TouchableOpacity style={styles.houseRow} onPress={() => setExpanded(open ? null : h.id)} onLongPress={() => removeHouse(h)}>
                <View style={{ flex: 1 }}>
                  <Text style={[typography.body, { fontWeight: '700' }]}>{h.name}</Text>
                  <Text style={typography.caption}>Join code: <Text style={styles.code}>{h.joinCode}</Text> · {assigned.length} manager{assigned.length === 1 ? '' : 's'}</Text>
                </View>
                <Text style={styles.chev}>{open ? '▾' : '›'}</Text>
              </TouchableOpacity>
              {open ? (
                <View style={styles.assignArea}>
                  <Text style={[typography.caption, { fontWeight: '700', marginBottom: 4 }]}>Assign house managers</Text>
                  {managers.length === 0 ? (
                    <Text style={typography.caption}>Add house managers first (below), then assign them here.</Text>
                  ) : managers.map((m) => {
                    const on = assigned.includes(m.id);
                    return (
                      <TouchableOpacity key={m.id} style={styles.mgrToggle} onPress={() => toggleManager(h.id, m.id, !on)}>
                        <View style={[styles.box, on ? styles.boxOn : null]}>{on ? <Text style={styles.boxCheck}>✓</Text> : null}</View>
                        <Text style={typography.body}>{m.name || m.email}</Text>
                      </TouchableOpacity>
                    );
                  })}
                  <Text style={[typography.caption, { color: colors.textMuted, marginTop: 4 }]}>Long-press the house to delete it.</Text>
                </View>
              ) : null}
            </View>
          );
        })}
        <Button title="➕ Add a house" variant="secondary" onPress={() => setAddOpen(true)} />
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
  assignArea: { marginTop: spacing.sm, paddingLeft: spacing.sm },
  mgrToggle: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  box: { width: 22, height: 22, borderRadius: 5, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm },
  boxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  boxCheck: { color: colors.textInverse, fontWeight: '800', fontSize: 13 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: spacing.lg },
  modal: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md },
  input: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, fontSize: 16, color: colors.textPrimary, marginVertical: spacing.md },
});
