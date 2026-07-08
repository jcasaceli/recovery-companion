import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Switch, Alert } from 'react-native';
import { Card, SectionTitle } from './ui';
import { colors, spacing, radius, typography } from '../theme';
import { TimeField } from './PickerFields';
import { getCurfew, setCurfew, listCurfewCheckins, curfewUsesPerDay, CurfewCheckin } from '../services/db';
import { to12h, formatDateTime } from '../utils/format';

const WEEK_AGO = () => new Date(Date.now() - 7 * 86400000).toISOString();
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Staff control for a single member's curfew: enable/disable, set check-in
 *  times (the same every day, or different times per weekday), and review
 *  recent GPS check-ins. */
export function CurfewManager({ individualId, memberName }: { individualId: string; memberName?: string }) {
  const [enabled, setEnabled] = useState(false);
  const [times, setTimes] = useState<string[]>([]);
  const [perDay, setPerDay] = useState(false);
  const [dayTimes, setDayTimes] = useState<Record<string, string[]>>({});
  const [checkins, setCheckins] = useState<CurfewCheckin[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getCurfew(individualId).then((c) => {
      if (c) {
        setEnabled(c.enabled); setTimes(c.times);
        setDayTimes(c.dayTimes ?? {});
        setPerDay(curfewUsesPerDay(c));
      }
      setLoaded(true);
    }).catch(() => setLoaded(true));
    listCurfewCheckins(individualId, WEEK_AGO()).then(setCheckins).catch(() => {});
  }, [individualId]);

  const persist = async (nextEnabled: boolean, nextTimes: string[], nextPerDay: boolean, nextDayTimes: Record<string, string[]>) => {
    try { await setCurfew(individualId, { enabled: nextEnabled, times: nextTimes, dayTimes: nextPerDay ? nextDayTimes : {} }); }
    catch (e: any) { Alert.alert('Could not save', e?.message ?? 'Try again.'); }
  };

  const toggle = (v: boolean) => { setEnabled(v); persist(v, times, perDay, dayTimes); };

  const togglePerDay = (v: boolean) => {
    // Turning per-day ON: seed each day from the "same every day" list so nothing is lost.
    const seeded = v && Object.keys(dayTimes).length === 0
      ? DAYS.reduce((acc, _d, i) => { acc[String(i)] = [...times]; return acc; }, {} as Record<string, string[]>)
      : dayTimes;
    setPerDay(v); setDayTimes(seeded); persist(enabled, times, v, seeded);
  };

  // ── "same every day" list ──
  const addTime = (t: string) => {
    if (!t || times.includes(t)) return;
    const next = [...times, t].sort();
    setTimes(next); persist(enabled, next, perDay, dayTimes);
  };
  const removeTime = (t: string) => {
    const next = times.filter((x) => x !== t);
    setTimes(next); persist(enabled, next, perDay, dayTimes);
  };

  // ── per-weekday lists ──
  const addDayTime = (dayIdx: number, t: string) => {
    if (!t) return;
    const cur = dayTimes[String(dayIdx)] ?? [];
    if (cur.includes(t)) return;
    const next = { ...dayTimes, [String(dayIdx)]: [...cur, t].sort() };
    setDayTimes(next); persist(enabled, times, perDay, next);
  };
  const removeDayTime = (dayIdx: number, t: string) => {
    const cur = dayTimes[String(dayIdx)] ?? [];
    const next = { ...dayTimes, [String(dayIdx)]: cur.filter((x) => x !== t) };
    setDayTimes(next); persist(enabled, times, perDay, next);
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
            <View style={[styles.row, { marginTop: spacing.sm }]}>
              <Text style={[typography.body, { flex: 1 }]}>Different times on different days</Text>
              <Switch value={perDay} onValueChange={togglePerDay} trackColor={{ true: colors.primary }} disabled={!loaded} />
            </View>

            {!perDay ? (
              <>
                <Text style={[typography.caption, { fontWeight: '700', marginTop: spacing.sm, marginBottom: spacing.xs }]}>Check-in times (every day)</Text>
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
            ) : (
              <View style={{ marginTop: spacing.sm }}>
                {DAYS.map((day, i) => {
                  const dt = dayTimes[String(i)] ?? [];
                  return (
                    <View key={day} style={styles.dayBlock}>
                      <Text style={[typography.caption, { fontWeight: '700', marginBottom: spacing.xs }]}>{day}</Text>
                      {dt.length === 0 ? (
                        <Text style={[typography.caption, { color: colors.textMuted, marginBottom: spacing.xs }]}>No curfew this day.</Text>
                      ) : (
                        <View style={styles.chips}>
                          {dt.map((t) => (
                            <TouchableOpacity key={t} style={styles.chip} onPress={() => removeDayTime(i, t)}>
                              <Text style={styles.chipText}>{to12h(t)}</Text>
                              <Text style={styles.chipX}>  ✕</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                      <TimeField value="" onChange={(t) => addDayTime(i, t)} placeholder={`Add a ${day} time`} />
                    </View>
                  );
                })}
                <Text style={[typography.caption, { color: colors.textMuted }]}>Tap a time to remove it. Leave a day empty for no curfew that day.</Text>
              </View>
            )}
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
  dayBlock: { borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: spacing.sm, marginBottom: spacing.sm },
  divider: { height: 1, backgroundColor: colors.divider, marginVertical: spacing.sm },
  ciRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 3 },
});
