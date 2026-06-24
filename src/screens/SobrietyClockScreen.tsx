import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { colors, spacing, typography } from '../theme';
import { useAppState } from '../state/store';
import { sobrietyParts, daysSince } from '../utils/format';

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Full-screen, dedicated sobriety clock — a live circular timer showing exactly
 *  how long the user has been sober, down to the second. The ring fills once per
 *  minute (one sweep = 60 seconds) so it visibly ticks. */
export function SobrietyClockScreen() {
  const nav = useNavigation<any>();
  const { lovedOne } = useAppState();
  const date = lovedOne.sobrietyDate;

  // Re-render every second to keep the clock live.
  const [, tick] = useState(0);
  useEffect(() => {
    if (!date) return;
    const id = setInterval(() => tick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [date]);

  const parts = date ? sobrietyParts(date) : null;

  // Geometry for the ring.
  const screenW = Dimensions.get('window').width;
  const size = Math.min(screenW - spacing.lg * 2, 320);
  const stroke = 18;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  // Progress = how far through the current minute we are (0..1) → one sweep/min.
  const progress = parts ? parts.seconds / 60 : 0;
  const offset = c * (1 - progress);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <Text style={styles.title}>Your Sobriety Clock</Text>

        {!date ? (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>⏱️</Text>
            <Text style={styles.emptyTitle}>Start your clock</Text>
            <Text style={styles.emptyBody}>
              Set the date you’re counting from and watch every second of your recovery add up.
            </Text>
            <TouchableOpacity style={styles.cta} onPress={() => nav.navigate('Home')}>
              <Text style={styles.ctaText}>Set my sobriety date →</Text>
            </TouchableOpacity>
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
              <Stat n={parts!.months} label={parts!.months === 1 ? 'month' : 'months'} />
              <Stat n={parts!.days} label={parts!.days === 1 ? 'day' : 'days'} />
              <Stat n={parts!.hours} label="hrs" />
              <Stat n={parts!.minutes} label="min" />
              <Stat n={parts!.seconds} label="sec" />
            </View>

            <Text style={styles.encourage}>One second at a time. Keep going. 💚</Text>
          </>
        )}
      </View>
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
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  title: { ...typography.h2, marginBottom: spacing.xl, textAlign: 'center' },
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
