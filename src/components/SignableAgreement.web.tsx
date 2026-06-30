import React, { useState } from 'react';
import { View, Text, Modal, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { SignaturePad } from './SignaturePad';
import { colors, spacing, radius, typography } from '../theme';
import { decorateAgreementHtml, agreementFieldLabel } from '../utils/agreementFields';

/**
 * Web: render the rich-text agreement with its inline fields. In sign mode the
 * resident clicks a field in the document to sign/fill it; in read mode the
 * signed values are shown in place.
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

  const onClick = (e: any) => {
    if (mode !== 'sign') return;
    const el = (e.target as any)?.closest?.('[data-sl-field]');
    if (!el) return;
    open(el.getAttribute('data-sl-key'), el.getAttribute('data-sl-field'));
  };

  return (
    <View>
      {/* Authored by the org's own staff in the CRM; rendered back to residents. */}
      <div
        onClick={onClick}
        style={{ fontSize: 15, lineHeight: 1.6, color: colors.textPrimary, wordBreak: 'break-word' }}
        dangerouslySetInnerHTML={{ __html: decorateAgreementHtml(html, values, mode) }}
      />

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
                  placeholder={active.type === 'initials' ? 'ABC' : active.type === 'date' ? '2026-01-31' : 'Type here'}
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize={active.type === 'initials' ? 'characters' : 'sentences'}
                />
              </>
            ) : null}
            <TouchableOpacity style={styles.save} onPress={save}><Text style={styles.saveText}>Save</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setActive(null)} style={{ alignItems: 'center', paddingVertical: spacing.sm }}><Text style={{ color: colors.textSecondary }}>Cancel</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: spacing.lg },
  modal: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, maxWidth: 520, alignSelf: 'center', width: '100%' },
  input: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, fontSize: 16, color: colors.textPrimary, marginBottom: spacing.sm },
  save: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.sm },
  saveText: { color: colors.textInverse, fontWeight: '700', fontSize: 16 },
});
