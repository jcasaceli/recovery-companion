import React, { useState } from 'react';
import { View, Text, Modal, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { SignaturePad } from './SignaturePad';
import { colors, spacing, radius, typography } from '../theme';
import { parseInlineDoc, agreementFieldLabel, isFieldFilled, DocRun } from '../utils/agreementFields';

const kbType = (t: string): any => (t === 'number' ? 'number-pad' : t === 'phone' ? 'phone-pad' : t === 'email' ? 'email-address' : 'default');

/**
 * Native: render the agreement with its fields tappable INLINE in the document
 * (no separate list). Tapping a field opens a signature pad / input, or toggles
 * a checkbox, right where it sits in the text.
 */
export function SignableAgreement({
  html,
  mode,
  values,
  onChangeValue,
}: {
  html: string;
  mode: 'sign' | 'read';
  values: Record<string, any>;
  onChangeValue: (key: string, value: any) => void;
}) {
  const blocks = parseInlineDoc(html);
  const [active, setActive] = useState<{ key: string; type: string } | null>(null);
  const [paths, setPaths] = useState<string[]>([]);
  const [text, setText] = useState('');

  const open = (key: string, type: string) => {
    setActive({ key, type });
    const v = values[key];
    setPaths(type === 'signature' && v?.paths ? v.paths : []);
    setText(type !== 'signature' && typeof v === 'string' ? v : (type === 'date' ? new Date().toISOString().slice(0, 10) : ''));
  };
  const save = () => {
    if (!active) return;
    onChangeValue(active.key, active.type === 'signature' ? { paths } : text.trim());
    setActive(null);
  };
  const tapField = (r: DocRun) => {
    if (mode !== 'sign' || !r.key || !r.type) return;
    if (r.type === 'checkbox') { onChangeValue(r.key, isFieldFilled('checkbox', values[r.key]) ? '' : 'checked'); return; }
    open(r.key, r.type);
  };

  const fieldText = (r: DocRun) => {
    const filled = isFieldFilled(r.type!, values[r.key!]);
    if (r.type === 'signature') return filled ? ' ✓ Signed ' : ' ✍️ Sign ';
    if (r.type === 'checkbox') return filled ? ' ☑ ' : ' ☐ ';
    if (filled) return ` ${String(values[r.key!])} `;
    return ` ${agreementFieldLabel(r.type!)} `;
  };

  return (
    <View>
      {blocks.map((b, bi) => (
        <View key={bi} style={styles.block}>
          {b.bullet ? <Text style={[typography.body, { marginRight: 6 }]}>•</Text> : null}
          <Text style={[typography.body, { flex: 1, lineHeight: 24, color: colors.textPrimary }]}>
            {b.runs.map((r, ri) => {
              if (r.kind === 'text') return <Text key={ri}>{r.text}</Text>;
              const filled = isFieldFilled(r.type!, values[r.key!]);
              return (
                <Text
                  key={ri}
                  onPress={() => tapField(r)}
                  style={[styles.chip, filled ? styles.chipFilled : styles.chipEmpty]}
                >
                  {fieldText(r)}
                </Text>
              );
            })}
          </Text>
        </View>
      ))}

      <Modal visible={!!active} transparent animationType="fade" onRequestClose={() => setActive(null)}>
        <View style={styles.backdrop}>
          <View style={styles.modal}>
            <Text style={typography.h3}>{active ? agreementFieldLabel(active.type) : ''}</Text>
            {active?.type === 'signature' ? (
              <>
                <Text style={[typography.caption, { marginVertical: spacing.xs }]}>Sign in the box below.</Text>
                <SignaturePad height={160} onChange={setPaths} />
              </>
            ) : active ? (
              <>
                <Text style={[typography.caption, { marginVertical: spacing.xs }]}>
                  {active.type === 'date' ? 'Enter the date.' : active.type === 'initials' ? 'Type your initials.' : 'Type your answer.'}
                </Text>
                <TextInput
                  style={styles.input}
                  value={text}
                  onChangeText={setText}
                  placeholder={active.type === 'initials' ? 'ABC' : active.type === 'date' ? '2026-01-31' : active.type === 'email' ? 'name@email.com' : active.type === 'phone' ? '(555) 123-4567' : 'Type here'}
                  placeholderTextColor={colors.textMuted}
                  keyboardType={kbType(active.type)}
                  autoCapitalize={active.type === 'initials' ? 'characters' : active.type === 'email' ? 'none' : 'sentences'}
                />
              </>
            ) : null}
            <TouchableOpacity style={styles.saveBtn} onPress={save}><Text style={styles.saveText}>Save</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setActive(null)} style={{ alignItems: 'center', paddingVertical: spacing.sm }}><Text style={{ color: colors.textSecondary }}>Cancel</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { flexDirection: 'row', marginBottom: spacing.sm },
  chip: { fontWeight: '700', borderRadius: 4, overflow: 'hidden' },
  chipEmpty: { backgroundColor: '#FCE8A6', color: '#7a5b00' },
  chipFilled: { backgroundColor: '#CDE9D6', color: '#1f5130' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: spacing.lg },
  modal: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md },
  input: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, fontSize: 16, color: colors.textPrimary, marginBottom: spacing.sm },
  saveBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.sm },
  saveText: { color: colors.textInverse, fontWeight: '700', fontSize: 16 },
});
