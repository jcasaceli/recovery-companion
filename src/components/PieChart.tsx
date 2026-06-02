import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { colors, spacing, typography } from '../theme';

export interface PieSlice {
  label: string;
  value: number;
  color: string;
}

/** Simple donut chart. Renders nothing meaningful if all values are 0. */
export function PieChart({ data, size = 180 }: { data: PieSlice[]; size?: number }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const stroke = 26;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <View style={styles.wrap}>
      <Svg width={size} height={size}>
        <G rotation={-90} originX={size / 2} originY={size / 2}>
          {/* track */}
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.surfaceAlt} strokeWidth={stroke} fill="none" />
          {total > 0 &&
            data.map((d, i) => {
              if (d.value <= 0) return null;
              const len = (d.value / total) * c;
              const circle = (
                <Circle
                  key={i}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  stroke={d.color}
                  strokeWidth={stroke}
                  fill="none"
                  strokeDasharray={`${len} ${c - len}`}
                  strokeDashoffset={-offset}
                />
              );
              offset += len;
              return circle;
            })}
        </G>
      </Svg>
      <View style={styles.center}>
        <Text style={styles.total}>{total}</Text>
        <Text style={typography.caption}>this month</Text>
      </View>

      <View style={styles.legend}>
        {data.map((d) => (
          <View key={d.label} style={styles.legendRow}>
            <View style={[styles.dot, { backgroundColor: d.color }]} />
            <Text style={styles.legendText}>{d.label}: {d.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  center: { position: 'absolute', top: 64, alignItems: 'center' },
  total: { fontSize: 30, fontWeight: '800', color: colors.textPrimary },
  legend: { marginTop: spacing.md, alignSelf: 'stretch' },
  legendRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xs },
  dot: { width: 12, height: 12, borderRadius: 6, marginRight: spacing.sm },
  legendText: { ...typography.bodySecondary },
});
