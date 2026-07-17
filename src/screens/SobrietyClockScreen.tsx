import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { colors, spacing, typography } from '../theme';
import { useAppState } from '../state/store';
import { sobrietyParts, daysSince } from '../utils/format';
import { DateField } from '../components/PickerFields';
import { Button } from '../components/ui';

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Full-screen, dedicated sobriety clock — a live circular timer showing exactly
 *  how long the user has been sober, down to the second. The ring fills once per
 *  minute (one sweep = 60 seconds) so it visibly ticks. */
export function SobrietyClockScreen() {
  const { lovedOne, resetSobrietyDate } = useAppState();
  const date = lovedOne.sobrietyDate;

  // Edit the sobriety date right here (members no longer have to go to Home).
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const openEdit = () => { setDraft(date || ''); setEditing(true); };
  const saveEdit = () => { if (draft) resetSobrietyDate(draft); setEditing(false); };

  // Re-render every second to keep the clock live.
  const [, tick] = useState(0);
  useEffect(() => {
    if (!date) return;
    const id = setInterval(() => tick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [date]);

  const parts = date ? sobrietyParts(date) : null;
  // Split full months into years + remaining months. Show "years" only once they
  // have at least one (no "0 years" for anyone under a year).
  const years = parts ? Math.floor(parts.months / 12) : 0;
  const monthsShown = parts ? (years >= 1 ? parts.months % 12 : parts.months) : 0;

  // Geometry for the ring.
  const screenW = Dimensions.get('window').width;
  const size = Math.min(screenW - spacing.lg * 2, 320);
  const stroke = 18;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  // Progress = how far through the current minute we are (0..1) → one sweep/min.
  const progress = parts ? parts.seconds / 60 : 0;
  const offset = c * (1 - progress);

  // Inline date editor (shared by the empty + populated states).
  const editor = (
    <View style={styles.editor}>
      <Text style={styles.editorLabel}>Your sobriety date</Text>
      <DateField value={draft} onChange={setDraft} placeholder="Pick your sobriety date" />
      <View style={{ height: spacing.sm }} />
      <Button title="Save sobriety date" onPress={saveEdit} disabled={!draft} />
      <TouchableOpacity onPress={() => setEditing(false)} style={{ alignItems: 'center', paddingVertical: spacing.sm }}>
        <Text style={{ color: colors.textSecondary }}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Your Sobriety Clock</Text>
        <Text style={styles.cakeLine}>🎂 To the future Cake-Getters</Text>

        {!date ? (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>⏱️</Text>
            <Text style={styles.emptyTitle}>Start your clock</Text>
            <Text style={styles.emptyBody}>
              Set the date you’re counting from and watch every second of your recovery add up.
            </Text>
            {editing ? editor : (
              <TouchableOpacity style={styles.cta} onPress={openEdit}>
                <Text style={styles.ctaText}>Set my sobriety date →</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <>
            <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
              <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
                <Defs>
                  <LinearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
                    <Stop offset="0" stopColor={colors.primary} />
                    <Stop offset="1" stopColor={colors.accent} />
                  </LinearGradient>
                </Defs>
                {/* track */}
                <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.border} strokeWidth={stroke} fill="none" />
                {/* progress */}
                <Circle
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  stroke="url(#ring)"
                  strokeWidth={stroke}
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={c}
                  strokeDashoffset={offset}
                  transform={`rotate(-90 ${size / 2} ${size / 2})`}
                />
              </Svg>
              {/* center readout */}
              <View style={styles.center}>
                <Text style={styles.bigDays}>{daysSince(date)}</Text>
                <Text style={styles.daysLabel}>days sober</Text>
                <Text style={styles.clock}>{pad2(parts!.hours)}:{pad2(parts!.minutes)}:{pad2(parts!.seconds)}</Text>
              </View>
            </View>

            <View style={styles.breakdownRow}>
              {years >= 1 ? <Stat n={years} label={years === 1 ? 'year' : 'years'} /> : null}
              {(years >= 1 || monthsShown > 0) ? <Stat n={monthsShown} label={monthsShown === 1 ? 'month' : 'months'} /> : null}
              <Stat n={parts!.days} label={parts!.days === 1 ? 'day' : 'days'} />
              <Stat n={parts!.hours} label="hrs" />
              <Stat n={parts!.minutes} label="min" />
              <Stat n={parts!.seconds} label="sec" />
            </View>

            <Text style={styles.encourage}>One second at a time. Keep going. 💚</Text>

            {editing ? editor : (
              <TouchableOpacity onPress={openEdit} style={styles.editBtn}>
                <Text style={styles.editBtnText}>✏️ Edit sobriety date</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statN}>{n}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  editor: { alignSelf: 'stretch', marginTop: spacing.lg },
  editorLabel: { ...typography.bodySecondary, fontWeight: '700', marginBottom: spacing.xs, textAlign: 'center' },
  editBtn: { marginTop: spacing.lg, paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, borderRadius: 999, borderWidth: 1, borderColor: colors.border },
  editBtnText: { color: colors.primary, fontWeight: '700' },
  title: { ...typography.h2, marginBottom: spacing.xs, textAlign: 'center' },
  cakeLine: { ...typography.body, color: colors.primary, fontWeight: '800', textAlign: 'center', marginBottom: spacing.xl },
  center: { alignItems: 'center', justifyContent: 'center' },
  bigDays: { fontSize: 64, fontWeight: '800', color: colors.textPrimary, lineHeight: 68, fontVariant: ['tabular-nums'] },
  daysLabel: { ...typography.bodySecondary, marginTop: -2, marginBottom: spacing.sm },
  clock: { fontSize: 26, fontWeight: '700', color: colors.primary, fontVariant: ['tabular-nums'], letterSpacing: 1 },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xl, alignSelf: 'stretch', paddingHorizontal: spacing.sm },
  stat: { alignItems: 'center', flex: 1 },
  statN: { fontSize: 20, fontWeight: '800', color: colors.textPrimary, fontVariant: ['tabular-nums'] },
  statLabel: { ...typography.caption },
  encourage: { ...typography.bodySecondary, marginTop: spacing.xl, textAlign: 'center' },
  empty: { alignItems: 'center', paddingHorizontal: spacing.lg },
  emptyEmoji: { fontSize: 56, marginBottom: spacing.md },
  emptyTitle: { ...typography.h2, marginBottom: spacing.sm },
  emptyBody: { ...typography.bodySecondary, textAlign: 'center', lineHeight: 22, marginBottom: spacing.lg },
  cta: { backgroundColor: colors.primary, borderRadius: 999, paddingVertical: spacing.md, paddingHorizontal: spacing.xl },
  ctaText: { color: colors.textInverse, fontWeight: '700', fontSize: 16 },
});
