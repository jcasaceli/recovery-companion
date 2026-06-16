import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Switch, Alert } from 'react-native';
import { Card, SectionTitle } from './ui';
import { colors, spacing, radius, typography } from '../theme';
import { TimeField } from './PickerFields';
import { getCurfew, setCurfew, listCurfewCheckins, CurfewCheckin } from '../services/db';
import { to12h, formatDateTime } from '../utils/format';

const WEEK_AGO = () => new Date(Date.now() - 7 * 86400000).toISOString();

/** Staff control for a single member's curfew: enable/disable, set check-in
 *  times, and review recent GPS check-ins. */
export function CurfewManager({ individualId, memberName }: { individualId: string; memberName?: string }) {
  const [enabled, setEnabled] = useState(false);
  const [times, setTimes] = useState<string[]>([]);
  const [checkins, setCheckins] = useState<CurfewCheckin[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getCurfew(individualId).then((c) => {
      if (c) { setEnabled(c.enabled); setTimes(c.times); }
      setLoaded(true);
    }).catch(() => setLoaded(true));
    listCurfewCheckins(individualId, WEEK_AGO()).then(setCheckins).catch(() => {});
  }, [individualId]);

  const persist = async (nextEnabled: boolean, nextTimes: string[]) => {
    try { await setCurfew(individualId, { enabled: nextEnabled, times: nextTimes }); }
    catch (e: any) { Alert.alert('Could not save', e?.message ?? 'Try again.'); }
  };

  const toggle = (v: boolean) => { setEnabled(v); persist(v, times); };

  const addTime = (t: string) => {
    if (!t || times.includes(t)) return;
    const next = [...times, t].sort();
    setTimes(next); persist(enabled, next);
  };

  const removeTime = (t: string) => {
    const next = times.filter((x) => x !== t);
    setTimes(next); persist(enabled, next);
  };

  return (
    <>
      <SectionTitle>Curfew check-ins</SectionTitle>
      <Card>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={typography.body}>Require GPS curfew check-ins</Text>
            <Text style={typography.caption}>{memberName || 'This member'} must check in from the app at each time below.</Text>
          </View>
          <Switch value={enabled} onValueChange={toggle} trackColor={{ true: colors.primary }} disabled={!loaded} />
        </View>

        {enabled ? (
          <>
            <Text style={[typography.caption, { fontWeight: '700', marginTop: spacing.sm, marginBottom: spacing.xs }]}>Check-in times</Text>
            {times.length === 0 ? (
              <Text style={typography.caption}>No times set yet — add one below.</Text>
            ) : (
              <View style={styles.chips}>
                {times.map((t) => (
                  <TouchableOpacity key={t} style={styles.chip} onPress={() => removeTime(t)}>
                    <Text style={styles.chipText}>{to12h(t)}</Text>
                    <Text style={styles.chipX}>  ✕</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <Text style={[typography.caption, { marginTop: spacing.xs, marginBottom: spacing.xs }]}>Add a time</Text>
            <TimeField value="" onChange={addTime} placeholder="Pick a check-in time" />
            <Text style={[typography.caption, { color: colors.textMuted }]}>Tap a time above to remove it.</Text>
          </>
        ) : null}

        {checkins.length ? (
          <>
            <View style={styles.divider} />
            <Text style={[typography.caption, { fontWeight: '700', marginBottom: spacing.xs }]}>Recent check-ins (7 days)</Text>
            {checkins.slice(0, 8).map((c) => (
              <View key={c.id} style={styles.ciRow}>
                <Text style={[typography.caption, { flex: 1 }]}>{formatDateTime(c.checkedAt)}</Text>
                <Text style={[typography.caption, { color: colors.textMuted, flex: 1, textAlign: 'right' }]} numberOfLines={1}>
                  {c.address || (c.latitude ? `${c.latitude.toFixed(4)}, ${c.longitude?.toFixed(4)}` : 'No location')}
                </Text>
              </View>
            ))}
          </>
        ) : null}
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primaryLight, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, marginRight: spacing.sm, marginBottom: spacing.sm },
  chipText: { color: colors.primaryDark, fontWeight: '700', fontSize: 13 },
  chipX: { color: colors.primaryDark, fontSize: 12 },
  divider: { height: 1, backgroundColor: colors.divider, marginVertical: spacing.sm },
  ciRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 3 },
});
