import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, radius, typography } from '../theme';
import { Button } from '../components/ui';
import { useAppState, OnboardingInput } from '../state/store';
import { Relationship, ProgramType } from '../types';
import { PROGRAM_LABELS } from '../utils/format';
import { DateField } from '../components/PickerFields';

const RELATIONSHIPS: { value: Relationship; label: string }[] = [
  { value: 'son', label: 'Son' },
  { value: 'daughter', label: 'Daughter' },
  { value: 'child', label: 'Child' },
  { value: 'spouse', label: 'Spouse' },
  { value: 'sibling', label: 'Sibling' },
  { value: 'parent', label: 'Parent' },
  { value: 'other', label: 'Other' },
];

const PROGRAM_TYPES = Object.keys(PROGRAM_LABELS) as ProgramType[];

type Step = 'welcome' | 'profile' | 'consent';

export function OnboardingScreen() {
  const { completeOnboarding } = useAppState();
  const [step, setStep] = useState<Step>('welcome');

  // profile fields
  const [firstName, setFirstName] = useState('');
  const [relationship, setRelationship] = useState<Relationship | null>(null);
  const [programName, setProgramName] = useState('');
  const [programType, setProgramType] = useState<ProgramType | null>(null);
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [sobrietyDate, setSobrietyDate] = useState('');
  const [agreed, setAgreed] = useState(false);

  const profileValid =
    firstName.trim().length > 0 &&
    relationship !== null &&
    programName.trim().length > 0 &&
    programType !== null &&
    /^\d{4}-\d{2}-\d{2}$/.test(startDate);

  const finish = () => {
    const input: OnboardingInput = {
      firstName,
      relationship: relationship!,
      programName,
      programType: programType!,
      treatmentStartDate: startDate,
      sobrietyDate: /^\d{4}-\d{2}-\d{2}$/.test(sobrietyDate) ? sobrietyDate : undefined,
    };
    completeOnboarding(input, false);
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {step === 'welcome' && (
          <View>
            <Text style={styles.emoji}>🌱</Text>
            <Text style={styles.title}>Welcome to{'\n'}Sober Living Companion</Text>
            <Text style={styles.lead}>
              A calm, private space to follow your loved one's treatment journey,
              ask questions any time, and stay connected with their care team.
            </Text>
            <Text style={styles.leadSmall}>
              You're not alone in this. We're here to help you feel informed and
              supported, one day at a time.
            </Text>
            <View style={{ height: spacing.lg }} />
            <Button title="Get started" onPress={() => setStep('profile')} />
            <View style={{ height: spacing.sm }} />
            <Button
              title="Explore with sample data"
              variant="secondary"
              onPress={() => completeOnboarding(null, true)}
            />
            <Text style={styles.sampleNote}>
              Sample mode loads a fictional example so you can look around. No real
              information is used.
            </Text>
          </View>
        )}

        {step === 'profile' && (
          <View>
            <Text style={styles.stepLabel}>Step 1 of 2</Text>
            <Text style={styles.title}>Tell us about your loved one</Text>

            <Text style={styles.fieldLabel}>Their first name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Jordan"
              placeholderTextColor={colors.textMuted}
              value={firstName}
              onChangeText={setFirstName}
            />

            <Text style={styles.fieldLabel}>Your relationship to them</Text>
            <View style={styles.chips}>
              {RELATIONSHIPS.map((r) => (
                <Chip
                  key={r.value}
                  label={r.label}
                  active={relationship === r.value}
                  onPress={() => setRelationship(r.value)}
                />
              ))}
            </View>

            <Text style={styles.fieldLabel}>Treatment program name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Brightwater Recovery Center"
              placeholderTextColor={colors.textMuted}
              value={programName}
              onChangeText={setProgramName}
            />

            <Text style={styles.fieldLabel}>Type of program</Text>
            <View style={styles.chips}>
              {PROGRAM_TYPES.map((p) => (
                <Chip
                  key={p}
                  label={PROGRAM_LABELS[p]}
                  active={programType === p}
                  onPress={() => setProgramType(p)}
                />
              ))}
            </View>

            <Text style={styles.fieldLabel}>Treatment start date</Text>
            <DateField value={startDate} onChange={setStartDate} placeholder="Pick a date" />

            <Text style={styles.fieldLabel}>Recovery / sobriety date (optional)</Text>
            <DateField value={sobrietyDate} onChange={setSobrietyDate} placeholder="Pick a date" />

            <View style={{ height: spacing.md }} />
            <Button title="Continue" onPress={() => setStep('consent')} disabled={!profileValid} />
            <BackLink onPress={() => setStep('welcome')} />
          </View>
        )}

        {step === 'consent' && (
          <View>
            <Text style={styles.stepLabel}>Step 2 of 2</Text>
            <Text style={styles.title}>A few important things</Text>

            <ConsentItem
              emoji="💬"
              heading="Companion is an AI assistant"
              body="The in-app assistant is powered by AI — it's not a doctor, therapist, or counselor, and it will always tell you so. It can offer support and general information, but clinical questions should go to your loved one's care team."
            />
            <ConsentItem
              emoji="🆘"
              heading="It's not for emergencies"
              body="If you or your loved one is ever in danger, call 911, or call/text 988 (Suicide & Crisis Lifeline). The app surfaces these any time it senses a crisis, and they're always on the Resources tab."
            />
            <ConsentItem
              emoji="🔒"
              heading="Your information is sensitive"
              body="Treatment information is private and protected. In this preview, your data stays on this device. Before any real sharing, you'll be asked for clear, specific consent."
            />

            <TouchableOpacity
              style={styles.agreeRow}
              onPress={() => setAgreed((a) => !a)}
              activeOpacity={0.7}
            >
              <View style={[styles.checkbox, agreed ? styles.checkboxOn : null]}>
                {agreed ? <Text style={styles.checkmark}>✓</Text> : null}
              </View>
              <Text style={styles.agreeText}>
                I understand Companion is an AI assistant and not a substitute for
                professional or emergency care.
              </Text>
            </TouchableOpacity>

            <View style={{ height: spacing.sm }} />
            <Button title="Enter the app" onPress={finish} disabled={!agreed} />
            <BackLink onPress={() => setStep('profile')} />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[styles.chip, active ? styles.chipActive : null]}
    >
      <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{label}</Text>
    </TouchableOpacity>
  );
}

function ConsentItem({ emoji, heading, body }: { emoji: string; heading: string; body: string }) {
  return (
    <View style={styles.consentItem}>
      <Text style={styles.consentEmoji}>{emoji}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.consentHeading}>{heading}</Text>
        <Text style={styles.consentBody}>{body}</Text>
      </View>
    </View>
  );
}

function BackLink({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.back}>
      <Text style={styles.backText}>Back</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  emoji: { fontSize: 56, textAlign: 'center', marginTop: spacing.xl, marginBottom: spacing.md },
  title: { ...typography.h1, marginBottom: spacing.md },
  lead: { ...typography.body, lineHeight: 24, color: colors.textSecondary },
  leadSmall: { ...typography.bodySecondary, lineHeight: 22, marginTop: spacing.md },
  sampleNote: { ...typography.caption, textAlign: 'center', marginTop: spacing.md },
  stepLabel: { ...typography.caption, color: colors.primary, fontWeight: '700', marginBottom: spacing.xs },
  fieldLabel: { ...typography.bodySecondary, fontWeight: '600', marginTop: spacing.md, marginBottom: spacing.sm },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 16,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 14, color: colors.textSecondary },
  chipTextActive: { color: colors.textInverse, fontWeight: '600' },
  consentItem: { flexDirection: 'row', marginBottom: spacing.lg },
  consentEmoji: { fontSize: 26, marginRight: spacing.md },
  consentHeading: { ...typography.h3, marginBottom: 4 },
  consentBody: { ...typography.bodySecondary, lineHeight: 21 },
  agreeRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: spacing.sm },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.primary,
    marginRight: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: colors.primary },
  checkmark: { color: colors.textInverse, fontWeight: '800', fontSize: 16 },
  agreeText: { flex: 1, ...typography.bodySecondary, lineHeight: 21 },
  back: { alignItems: 'center', paddingVertical: spacing.md, marginTop: spacing.xs },
  backText: { color: colors.textSecondary, fontSize: 15 },
});
