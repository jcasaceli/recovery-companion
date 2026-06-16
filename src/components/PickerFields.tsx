import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { colors, spacing, radius, typography } from '../theme';
import { to12h, formatDate, dayOfWeek } from '../utils/format';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function pad(n: number) { return String(n).padStart(2, '0'); }
function isoOf(y: number, m: number, d: number) { return `${y}-${pad(m + 1)}-${pad(d)}`; }

/** Tap-to-open calendar date picker. Works identically on web + native (pure RN,
 *  no native module). Emits 'YYYY-MM-DD'; shows MM-DD-YYYY + day of week. */
export function DateField({
  value, onChange, placeholder = 'Select a date',
}: { value?: string; onChange: (iso: string) => void; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const now = new Date();
  const [cur, setCur] = useState(() => {
    if (value) { const [y, m] = value.split('-').map(Number); return { y, m: m - 1 }; }
    return { y: now.getFullYear(), m: now.getMonth() };
  });

  const firstDow = new Date(cur.y, cur.m, 1).getDay();
  const daysIn = new Date(cur.y, cur.m + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysIn; d++) cells.push(d);

  const todayIso = isoOf(now.getFullYear(), now.getMonth(), now.getDate());
  const move = (delta: number) => {
    let m = cur.m + delta, y = cur.y;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    setCur({ y, m });
  };

  return (
    <>
      <TouchableOpacity style={styles.field} onPress={() => setOpen(true)} activeOpacity={0.7}>
        <Text style={[styles.fieldText, !value && { color: colors.textMuted }]}>
          {value ? `${formatDate(value)}  ·  ${dayOfWeek(value)}` : placeholder}
        </Text>
        <Text style={styles.icon}>📅</Text>
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setOpen(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.calCard}>
            <View style={styles.calHeader}>
              <TouchableOpacity onPress={() => move(-1)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Text style={styles.navArrow}>‹</Text>
              </TouchableOpacity>
              <Text style={styles.calTitle}>{MONTHS_FULL[cur.m]} {cur.y}</Text>
              <TouchableOpacity onPress={() => move(1)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Text style={styles.navArrow}>›</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.dowRow}>
              {DOW.map((d) => <Text key={d} style={styles.dowText}>{d}</Text>)}
            </View>
            <View style={styles.grid}>
              {cells.map((d, i) => {
                if (d === null) return <View key={`b${i}`} style={styles.cell} />;
                const iso = isoOf(cur.y, cur.m, d);
                const sel = iso === value;
                const isToday = iso === todayIso;
                return (
                  <TouchableOpacity
                    key={iso}
                    style={[styles.cell, sel && styles.cellSel, !sel && isToday && styles.cellToday]}
                    onPress={() => { onChange(iso); setOpen(false); }}
                  >
                    <Text style={[styles.cellText, sel && styles.cellTextSel]}>{d}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const TIMES: string[] = (() => {
  const arr: string[] = [];
  for (let h = 0; h < 24; h++) for (const m of [0, 30]) arr.push(`${pad(h)}:${pad(m)}`);
  return arr;
})();

/** Tap-to-open time picker (30-min steps), shown in 12-hour AM/PM. Emits "HH:MM"
 *  (24h) or '' when cleared. */
export function TimeField({
  value, onChange, placeholder = 'Select a time (optional)',
}: { value?: string; onChange: (hhmm: string) => void; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <TouchableOpacity style={styles.field} onPress={() => setOpen(true)} activeOpacity={0.7}>
        <Text style={[styles.fieldText, !value && { color: colors.textMuted }]}>
          {value ? to12h(value) : placeholder}
        </Text>
        <Text style={styles.icon}>🕐</Text>
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setOpen(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.timeCard}>
            <Text style={[styles.calTitle, { marginBottom: spacing.sm }]}>Select a time</Text>
            <ScrollView style={{ maxHeight: 300 }}>
              {value ? (
                <TouchableOpacity style={styles.timeRow} onPress={() => { onChange(''); setOpen(false); }}>
                  <Text style={[styles.timeText, { color: colors.textMuted }]}>Clear time</Text>
                </TouchableOpacity>
              ) : null}
              {TIMES.map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.timeRow, t === value && styles.timeRowSel]}
                  onPress={() => { onChange(t); setOpen(false); }}
                >
                  <Text style={[styles.timeText, t === value && styles.cellTextSel]}>{to12h(t)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md,
    marginVertical: spacing.xs,
  },
  fieldText: { fontSize: 15, color: colors.textPrimary, flex: 1 },
  icon: { fontSize: 16, marginLeft: spacing.sm },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: spacing.lg },
  calCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md },
  calHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  calTitle: { ...typography.h3 },
  navArrow: { fontSize: 28, color: colors.primary, fontWeight: '700', paddingHorizontal: spacing.sm },
  dowRow: { flexDirection: 'row' },
  dowText: { width: `${100 / 7}%`, textAlign: 'center', fontSize: 12, fontWeight: '700', color: colors.textMuted, paddingVertical: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md },
  cellSel: { backgroundColor: colors.primary },
  cellToday: { borderWidth: 1, borderColor: colors.primary },
  cellText: { fontSize: 15, color: colors.textPrimary },
  cellTextSel: { color: colors.textInverse, fontWeight: '700' },
  timeCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md },
  timeRow: { paddingVertical: spacing.md, paddingHorizontal: spacing.sm, borderRadius: radius.md },
  timeRowSel: { backgroundColor: colors.primaryLight },
  timeText: { fontSize: 16, color: colors.textPrimary, textAlign: 'center' },
});
