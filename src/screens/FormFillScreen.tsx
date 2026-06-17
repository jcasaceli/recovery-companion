import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Screen, ScreenTitle, Card, Button } from '../components/ui';
import { colors, spacing, radius, typography } from '../theme';
import { DateField } from '../components/PickerFields';
import { SignaturePad, SignatureView } from '../components/SignaturePad';
import { getFormResponse, submitFormResponse, FormResponse, FormField } from '../services/db';
import { formatDateTime } from '../utils/format';

async function fetchIp(): Promise<string | undefined> {
  try {
    const r = await fetch('https://api.ipify.org?format=json');
    const j = await r.json();
    return j?.ip;
  } catch { return undefined; }
}

export function FormFillScreen() {
  const route = useRoute<any>();
  const nav = useNavigation<any>();
  const id: string = route.params?.id;

  const [form, setForm] = useState<FormResponse | null>(null);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [name, setName] = useState('');
  const [paths, setPaths] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getFormResponse(id).then((f) => {
      if (f) { setForm(f); setAnswers(f.answers || {}); }
    }).catch(() => {});
  }, [id]);

  const set = (k: string, v: any) => setAnswers((a) => ({ ...a, [k]: v }));

  const missingRequired = (f: FormResponse) =>
    f.fields.filter((fld) => fld.required && !String(answers[fld.key] ?? '').trim()).map((fld) => fld.label);

  const submit = async () => {
    if (!form) return;
    const missing = missingRequired(form);
    if (missing.length) { Alert.alert('Please complete required fields', missing.join('\n')); return; }
    if (!name.trim() || paths.length === 0) { Alert.alert('Signature required', 'Type your name and sign before submitting.'); return; }
    setBusy(true);
    try {
      const ip = await fetchIp();
      await submitFormResponse(id, { answers, signaturePaths: paths, signerName: name.trim(), signedIp: ip });
      Alert.alert('Submitted ✅', 'Your form was signed and sent to your facilitator.');
      nav.goBack();
    } catch (e: any) {
      Alert.alert('Could not submit', e?.message ?? 'Please try again.');
    } finally { setBusy(false); }
  };

  if (!form) return <Screen edges={[]}><ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} /></Screen>;

  const done = form.status === 'completed';

  return (
    <Screen edges={[]}>
      <ScreenTitle title={form.title} subtitle={done ? 'Completed' : 'Please complete and sign'} />

      <Card>
        {form.fields.map((fld) => (
          <View key={fld.key} style={{ marginBottom: spacing.md }}>
            <Text style={styles.label}>{fld.label}{fld.required ? <Text style={{ color: colors.crisis }}> *</Text> : null}</Text>
            <FieldInput field={fld} value={answers[fld.key]} onChange={(v) => set(fld.key, v)} disabled={done} />
          </View>
        ))}
      </Card>

      {done ? (
        <Card>
          <Text style={[typography.body, { fontWeight: '700', marginBottom: spacing.sm }]}>Signed</Text>
          <SignatureView paths={form.signaturePaths ?? []} />
          <Text style={[typography.caption, { marginTop: spacing.sm }]}>Signed by {form.signerName || 'resident'}</Text>
          {form.signedAt ? <Text style={typography.caption}>{formatDateTime(form.signedAt)}</Text> : null}
          {form.signedIp ? <Text style={typography.caption}>IP {form.signedIp}</Text> : null}
        </Card>
      ) : (
        <Card>
          <Text style={[typography.body, { fontWeight: '700' }]}>Sign to submit</Text>
          <Text style={[typography.caption, { marginVertical: spacing.xs }]}>By signing, you confirm the information above is accurate. Your name, the date &amp; time, and your IP address are recorded.</Text>
          <Text style={styles.label}>Full name</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="First and last name" placeholderTextColor={colors.textMuted} autoCapitalize="words" />
          <Text style={styles.label}>Signature</Text>
          <SignaturePad height={150} onChange={setPaths} />
          <View style={{ height: spacing.sm }} />
          <Button title={busy ? 'Submitting…' : 'Sign & submit'} onPress={submit} disabled={busy} />
        </Card>
      )}
      <View style={{ height: spacing.xl }} />
    </Screen>
  );
}

function FieldInput({ field, value, onChange, disabled }: { field: FormField; value: any; onChange: (v: any) => void; disabled?: boolean }) {
  if (disabled) {
    const shown = field.type === 'yesno' ? (value ? 'Yes' : value === false ? 'No' : '—') : (String(value ?? '').trim() || '—');
    return <Text style={[typography.body, { color: colors.textSecondary }]}>{shown}</Text>;
  }
  switch (field.type) {
    case 'date':
      return <DateField value={value || ''} onChange={onChange} placeholder="Pick a date" />;
    case 'yesno':
      return (
        <View style={styles.yesno}>
          {[{ v: true, l: 'Yes' }, { v: false, l: 'No' }].map((o) => (
            <TouchableOpacity key={o.l} style={[styles.yn, value === o.v && styles.ynOn]} onPress={() => onChange(o.v)}>
              <Text style={[styles.ynText, value === o.v && { color: colors.textInverse }]}>{o.l}</Text>
            </TouchableOpacity>
          ))}
        </View>
      );
    case 'ssn_last4':
      return <TextInput style={styles.input} value={value || ''} onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, 4))} placeholder="••••" placeholderTextColor={colors.textMuted} keyboardType="number-pad" maxLength={4} />;
    case 'longtext':
    case 'address':
      return <TextInput style={[styles.input, { minHeight: 72, textAlignVertical: 'top' }]} value={value || ''} onChangeText={onChange} placeholder={field.type === 'address' ? 'Street, city, state, ZIP' : 'Type here…'} placeholderTextColor={colors.textMuted} multiline />;
    case 'number':
      return <TextInput style={styles.input} value={value || ''} onChangeText={onChange} placeholder="Number" placeholderTextColor={colors.textMuted} keyboardType="number-pad" />;
    case 'phone':
      return <TextInput style={styles.input} value={value || ''} onChangeText={onChange} placeholder="(555) 123-4567" placeholderTextColor={colors.textMuted} keyboardType="phone-pad" />;
    default:
      return <TextInput style={styles.input} value={value || ''} onChangeText={onChange} placeholder="Type here…" placeholderTextColor={colors.textMuted} />;
  }
}

const styles = StyleSheet.create({
  label: { ...typography.bodySecondary, fontWeight: '600', marginBottom: spacing.xs },
  input: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, fontSize: 15, color: colors.textPrimary },
  yesno: { flexDirection: 'row' },
  yn: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, marginRight: spacing.sm, borderWidth: 1, borderColor: colors.border },
  ynOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  ynText: { fontWeight: '700', color: colors.textSecondary },
});
