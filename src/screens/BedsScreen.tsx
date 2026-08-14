import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, RefreshControl, Alert } from 'react-native';
import { KeyboardModal } from '../components/KeyboardModal';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, typography, shadow } from '../theme';
import { useAppState } from '../state/store';
import * as dbApi from '../services/db';

/** v1 Bed Board — one card per house showing filled vs open beds. Tap an open
 *  bed to move a resident in. Open counts come from each house's capacity. */
export function BedsScreen() {
  const { clients, reloadCloud } = useAppState();
  const nav = useNavigation<any>();
  // initial: false keeps the Members list in the back stack so Back works.
  const openClient = (id: string) => nav.navigate('Clients', { screen: 'ClientProfile', params: { id }, initial: false });
  const [houses, setHouses] = useState<dbApi.House[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [assignTo, setAssignTo] = useState<dbApi.House | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => { dbApi.listHouses().then(setHouses).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    try { await reloadCloud(); load(); } finally { setRefreshing(false); }
  };

  const inCare = clients.filter((c) => c.status === 'in_care');
  const residentsOf = (h: dbApi.House) =>
    inCare.filter((c) => (c.houseId ? c.houseId === h.id : c.houseName === h.name));

  const totalCap = houses.reduce((s, h) => s + (h.capacity || 0), 0);
  const totalOcc = houses.reduce((s, h) => s + residentsOf(h).length, 0);
  const totalOpen = Math.max(0, totalCap - totalOcc);

  const assign = async (individualId: string) => {
    if (!assignTo) return;
    try {
      await dbApi.assignBed(individualId, { houseId: assignTo.id, houseName: assignTo.name });
      await reloadCloud();
      setAssignTo(null);
    } catch (e: any) {
      Alert.alert('Could not assign', e?.message ?? 'Try again.');
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <Text style={typography.h1}>Bed Board</Text>

        <View style={styles.summary}>
          <Stat label="Filled" value={String(totalOcc)} />
          <Stat label="Open" value={String(totalOpen)} accent />
          <Stat label="Total beds" value={String(totalCap)} />
        </View>

        {houses.length === 0 ? (
          <View style={styles.card}><Text style={typography.body}>No houses yet. Add houses in Settings and they’ll show here.</Text></View>
        ) : houses.map((h) => {
          const res = residentsOf(h);
          const cap = h.capacity || 0;
          const open = Math.max(0, cap - res.length);
          const isOpen = !!expanded[h.id];
          const pct = cap ? Math.min(100, Math.round((res.length / cap) * 100)) : 0;
          return (
            <View key={h.id} style={styles.card}>
              <TouchableOpacity onPress={() => setExpanded((e) => ({ ...e, [h.id]: !e[h.id] }))} style={styles.houseHead} activeOpacity={0.7}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.houseName}>{h.name}</Text>
                  <Text style={styles.houseMeta}>{res.length}/{cap || '?'} filled · <Text style={{ color: open > 0 ? colors.success : colors.textMuted, fontWeight: '700' }}>{open} open</Text></Text>
                </View>
                <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textMuted} />
              </TouchableOpacity>

              <View style={styles.barTrack}><View style={[styles.barFill, { width: `${pct}%` }]} /></View>

              {isOpen ? (
                <View style={styles.bedList}>
                  {res.map((c) => (
                    <TouchableOpacity key={c.id} style={styles.bedRow} onPress={() => openClient(c.id)} activeOpacity={0.6}>
                      <Ionicons name="person" size={16} color={colors.primary} />
                      <Text style={styles.bedName}>{c.firstName} {c.lastName || ''}</Text>
                      <Text style={styles.bedTag}>{c.bedLabel || '—'}</Text>
                      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                    </TouchableOpacity>
                  ))}
                  {Array.from({ length: open }).map((_, i) => (
                    <TouchableOpacity key={`open-${i}`} style={[styles.bedRow, styles.openRow]} onPress={() => setAssignTo(h)} activeOpacity={0.7}>
                      <Ionicons name="add-circle-outline" size={18} color={colors.success} />
                      <Text style={[styles.bedName, { color: colors.textSecondary }]}>Open bed — tap to assign</Text>
                    </TouchableOpacity>
                  ))}
                  {cap === 0 ? <Text style={styles.hint}>Set this house’s bed count in Settings to track open beds.</Text> : null}
                </View>
              ) : null}
            </View>
          );
        })}
        <Text style={styles.footHint}>Bed counts come from each house’s capacity (set in Settings). Pull down to refresh.</Text>
      </ScrollView>

      <KeyboardModal visible={!!assignTo} onClose={() => setAssignTo(null)}>
            <Text style={typography.h3}>Assign to {assignTo?.name}</Text>
            <Text style={[typography.caption, { marginBottom: spacing.sm }]}>Pick a resident to move into this house.</Text>
            <ScrollView style={{ maxHeight: 340 }}>
              {inCare.filter((c) => (c.houseId ? c.houseId !== assignTo?.id : c.houseName !== assignTo?.name)).map((c) => (
                <TouchableOpacity key={c.id} style={styles.pickRow} onPress={() => assign(c.id)} activeOpacity={0.7}>
                  <Text style={styles.bedName}>{c.firstName} {c.lastName || ''}</Text>
                  <Text style={styles.bedTag}>{c.houseName || 'Unassigned'}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity onPress={() => setAssignTo(null)} style={{ alignItems: 'center', paddingVertical: spacing.sm }}>
              <Text style={{ color: colors.textSecondary }}>Cancel</Text>
            </TouchableOpacity>
          </KeyboardModal>
    </SafeAreaView>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, accent && { color: colors.success }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  summary: { flexDirection: 'row', gap: spacing.sm },
  stat: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, alignItems: 'center', ...shadow.card },
  statValue: { ...typography.h2, color: colors.textPrimary },
  statLabel: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, ...shadow.card, overflow: 'hidden' },
  houseHead: { flexDirection: 'row', alignItems: 'center', padding: spacing.md },
  houseName: { ...typography.h3 },
  houseMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  barTrack: { height: 5, backgroundColor: colors.surfaceAlt, marginHorizontal: spacing.md },
  barFill: { height: 5, backgroundColor: colors.primary, borderRadius: 3 },
  bedList: { padding: spacing.md, gap: spacing.xs },
  bedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  openRow: { backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, paddingHorizontal: spacing.sm, borderBottomWidth: 0, marginTop: 2 },
  bedName: { ...typography.body, fontWeight: '600', flex: 1 },
  bedTag: { ...typography.caption, color: colors.textMuted },
  hint: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },
  footHint: { ...typography.caption, color: colors.textMuted, textAlign: 'center', marginTop: spacing.sm },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: spacing.lg },
  modal: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, ...shadow.card },
  pickRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
});
