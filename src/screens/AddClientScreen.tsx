import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, radius, typography } from '../theme';
import { Button } from '../components/ui';
import { useAppState } from '../state/store';

/**
 * Shown to a signed-in facilitator who has no clients yet. Creates the
 * facilitator's org (if needed) and the first individual (client). After
 * creation the store reloads and the app shows the main experience.
 */
export function AddClientScreen() {
  const { createClient } = useAppState();
  const [orgName, setOrgName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [programName, setProgramName] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [sobrietyDate, setSobrietyDate] = useState('');
  const [busy, setBusy] = useState(false);

  const valid = firstName.trim().length > 0;

  const submit = async () => {
    setBusy(true);
    try {
      await createClient({
        orgName: orgName || undefined,
        firstName,
        programName: programName || undefined,
        treatmentStartDate: /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? startDate : undefined,
        sobrietyDate: /^\d{4}-\d{2}-\d{2}$/.test(sobrietyDate) ? sobrietyDate : undefined,
      });
      // On success the store reloads and the navigator switches to the main app.
    } catch (e: any) {
      Alert.alert('Could not add client', e?.message ?? 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.emoji}>👋</Text>
        <Text style={styles.title}>Add your first client</Text>
        <Text style={styles.lead}>
          Create a record for the person you're supporting. You can invite them
          and their family to their own accounts next.
        </Text>

        <Field label="Your organization name" value={orgName} onChange={setOrgName} placeholder="e.g. Brightwater Sober Companions" />
        <Field label="Client's first name" value={firstName} onChange={setFirstName} placeholder="e.g. Jordan" />
        <Field label="Program / level of care" value={programName} onChange={setProgramName} placeholder="e.g. IOP" />
        <Field label="Treatment start date" value={startDate} onChange={setStartDate} placeholder="YYYY-MM-DD" />
        <Field label="Sobriety date (optional)" value={sobrietyDate} onChange={setSobrietyDate} placeholder="YYYY-MM-DD" />

        <View style={{ height: spacing.md }} />
        <Button title="Add client" onPress={submit} disabled={!valid || busy} />
        {busy ? <ActivityIndicator style={{ marginTop: spacing.md }} color={colors.primary} /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({
  label, value, onChange, placeholder,
}: { label: string; value: string; onChange: (s: string) => void; placeholder?: string }) {
  return (
    <View>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  emoji: { fontSize: 48, textAlign: 'center', marginTop: spacing.lg },
  title: { ...typography.h1, textAlign: 'center', marginBottom: spacing.sm },
  lead: { ...typography.bodySecondary, textAlign: 'center', marginBottom: spacing.lg, lineHeight: 22 },
  fieldLabel: { ...typography.bodySecondary, fontWeight: '600', marginTop: spacing.md, marginBottom: spacing.xs },
  input: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, fontSize: 16, color: colors.textPrimary, borderWidth: 1, borderColor: colors.border },
});
