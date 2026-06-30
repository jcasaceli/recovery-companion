import React, { useState } from 'react';
import { View, Text, Modal, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { SignaturePad } from './SignaturePad';
import { RichTextView } from './RichTextView';
import { colors, spacing, radius, typography } from '../theme';
import { parseAgreementFields, agreementFieldLabel, isFieldFilled } from '../utils/agreementFields';

const kbType = (t: string): any => (t === 'number' ? 'number-pad' : t === 'phone' ? 'phone-pad' : t === 'email' ? 'email-address' : 'default');

/**
 * Native fallback: render the agreement text, then list its fields below for the
 * resident to sign/fill (inline-in-document tapping is the web experience).
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
  const fields = parseAgreementFields(html);
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

  return (
    <View>
      <RichTextView html={html} />
      {fields.length ? (
        <View style={{ marginTop: spacing.md }}>
          <Text style={[typography.body, { fontWeight: '700', marginBottom: spacing.xs }]}>Fields to complete</Text>
          {fields.map((f, i) => {
            const filled = isFieldFilled(f.type, values[f.key]);
            return (
              <TouchableOpacity
                key={f.key}
                style={[styles.fieldRow, filled && styles.fieldRowDone]}
                onPress={() => {
                  if (mode !== 'sign') return;
                  if (f.type === 'checkbox') { onChangeValue(f.key, filled ? '' : 'checked'); return; }
                  open(f.key, f.type);
                }}
                disabled={mode !== 'sign'}
              >
                <Text style={[typography.body, { flex: 1 }]}>{agreementFieldLabel(f.type)} {i + 1}</Text>
                <Text style={{ fontWeight: '700', color: filled ? colors.success : colors.warning }}>
                  {filled ? (f.type === 'signature' ? '✓ Signed' : f.type === 'checkbox' ? '☑ Checked' : String(values[f.key])) : (mode === 'sign' ? 'Tap to fill' : '—')}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}

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
  fieldRow: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, backgroundColor: '#FCE8A6', borderRadius: radius.md, marginBottom: spacing.sm },
  fieldRowDone: { backgroundColor: '#CDE9D6' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: spacing.lg },
  modal: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md },
  input: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, fontSize: 16, color: colors.textPrimary, marginBottom: spacing.sm },
  saveBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.sm },
  saveText: { color: colors.textInverse, fontWeight: '700', fontSize: 16 },
});
