import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Screen, ScreenTitle, Card, Button } from '../components/ui';
import { colors, spacing, radius, typography } from '../theme';
import { DateField } from '../components/PickerFields';
import { SignaturePad, SignatureView } from '../components/SignaturePad';
import { getFormResponse, submitFormResponse, getMyOrg, FormResponse, FormField } from '../services/db';
import { printBrandedForm } from '../utils/printForm';
import { Platform } from 'react-native';
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
  const [org, setOrg] = useState<any>(null);

  useEffect(() => {
    getFormResponse(id).then((f) => {
      if (f) { setForm(f); setAnswers(f.answers || {}); }
    }).catch(() => {});
    getMyOrg().then(setOrg).catch(() => {});   // for branded printing (staff only)
  }, [id]);

  const printForm = () => {
    if (!form) return;
    const ok = printBrandedForm(
      { name: org?.name, logoUrl: org?.logo_url, address: org?.address, phone: org?.contact_phone, email: org?.contact_email },
      form,
    );
    if (!ok) Alert.alert('Printing on the web', 'Open this resident on the web app (app.soberlivingcompanion.com) to print a branded copy. In-app printing on phones is coming in an update.');
  };

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
        {form.fields.map((fld) => {
          // Display-only blocks render the agreement's legal text (no input).
          if (fld.type === 'heading') return <Text key={fld.key} style={styles.formHeading}>{fld.label}</Text>;
          if (fld.type === 'paragraph') return <Text key={fld.key} style={styles.formPara}>{fld.label}</Text>;
          return (
            <View key={fld.key} style={{ marginBottom: spacing.md }}>
              <Text style={styles.label}>{fld.label}{fld.required ? <Text style={{ color: colors.crisis }}> *</Text> : null}</Text>
              <FieldInput field={fld} value={answers[fld.key]} onChange={(v) => set(fld.key, v)} disabled={done} />
            </View>
          );
        })}
      </Card>

      {done ? (
        <Card>
          <Text style={[typography.body, { fontWeight: '700', marginBottom: spacing.sm }]}>Signed</Text>
          <SignatureView paths={form.signaturePaths ?? []} />
          <Text style={[typography.caption, { marginTop: spacing.sm }]}>Signed by {form.signerName || 'resident'}</Text>
          {form.signedAt ? <Text style={typography.caption}>{formatDateTime(form.signedAt)}</Text> : null}
          {form.signedIp ? <Text style={typography.caption}>IP {form.signedIp}</Text> : null}
          <View style={{ height: spacing.sm }} />
          <Button title="🖨️  Print with our logo" variant="secondary" onPress={printForm} />
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

// Map a field to OS autofill hints so saved name/address/phone/email on the
// phone can auto-populate the form (iOS textContentType + Android autoComplete).
function autofill(field: FormField): { textContentType?: any; autoComplete?: any } {
  const k = `${field.key} ${field.label}`.toLowerCase();
  if (field.type === 'phone' || /phone|tel\b/.test(k)) return { textContentType: 'telephoneNumber', autoComplete: 'tel' };
  if (field.type === 'address' || /address/.test(k)) return { textContentType: 'fullStreetAddress', autoComplete: 'postal-address' };
  if (/email/.test(k)) return { textContentType: 'emailAddress', autoComplete: 'email' };
  if (/\bname\b/.test(k)) return { textContentType: 'name', autoComplete: 'name' };
  return {};
}

function FieldInput({ field, value, onChange, disabled }: { field: FormField; value: any; onChange: (v: any) => void; disabled?: boolean }) {
  const af = autofill(field);
  if (disabled) {
    if (field.type === 'signature') return <SignatureView paths={Array.isArray(value) ? value : []} />;
    const shown = field.type === 'yesno' ? (value ? 'Yes' : value === false ? 'No' : '—') : (String(value ?? '').trim() || '—');
    return <Text style={[typography.body, { color: colors.textSecondary }]}>{shown}</Text>;
  }
  switch (field.type) {
    case 'signature':
      return (
        <View>
          <SignaturePad height={150} onChange={(paths) => onChange(paths)} />
        </View>
      );
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
    case 'initial':
      return <TextInput style={[styles.input, styles.initial]} value={value || ''} onChangeText={(t) => onChange(t.toUpperCase().slice(0, 6))} placeholder="ABC" placeholderTextColor={colors.textMuted} autoCapitalize="characters" maxLength={6} />;
    case 'longtext':
    case 'address':
      return <TextInput style={[styles.input, { minHeight: 72, textAlignVertical: 'top' }]} value={value || ''} onChangeText={onChange} placeholder={field.type === 'address' ? 'Street, city, state, ZIP' : 'Type here…'} placeholderTextColor={colors.textMuted} multiline textContentType={af.textContentType} autoComplete={af.autoComplete} />;
    case 'number':
      return <TextInput style={styles.input} value={value || ''} onChangeText={onChange} placeholder="Number" placeholderTextColor={colors.textMuted} keyboardType="number-pad" />;
    case 'phone':
      return <TextInput style={styles.input} value={value || ''} onChangeText={onChange} placeholder="(555) 123-4567" placeholderTextColor={colors.textMuted} keyboardType="phone-pad" textContentType="telephoneNumber" autoComplete="tel" />;
    default:
      return <TextInput style={styles.input} value={value || ''} onChangeText={onChange} placeholder="Type here…" placeholderTextColor={colors.textMuted} textContentType={af.textContentType} autoComplete={af.autoComplete} />;
  }
}

const styles = StyleSheet.create({
  label: { ...typography.bodySecondary, fontWeight: '600', marginBottom: spacing.xs },
  input: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, fontSize: 15, color: colors.textPrimary },
  initial: { alignSelf: 'flex-start', minWidth: 96, letterSpacing: 4, fontWeight: '700' },
  formHeading: { ...typography.h3, marginTop: spacing.md, marginBottom: spacing.sm },
  formPara: { ...typography.bodySecondary, lineHeight: 21, marginBottom: spacing.md },
  yesno: { flexDirection: 'row' },
  yn: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, marginRight: spacing.sm, borderWidth: 1, borderColor: colors.border },
  ynOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  ynText: { fontWeight: '700', color: colors.textSecondary },
});
