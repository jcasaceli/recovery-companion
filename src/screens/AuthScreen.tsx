import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, radius, typography } from '../theme';
import { Button } from '../components/ui';
import { useAuth } from '../state/auth';
import { AppRole } from '../types';
import { toUsE164 } from '../utils/format';

const ROLES: { value: AppRole; label: string; blurb: string }[] = [
  { value: 'individual', label: 'I am a member of a sober living network', blurb: 'Track progress, pay membership fees, and find meetings.' },
  { value: 'facilitator', label: 'I am a facilitator', blurb: 'Manage members, payments, and notes.' },
];

type Step = 'choose' | 'signin' | 'signup' | 'verify';

/** Turn raw auth errors into friendly, human messages. */
function friendlyAuthError(raw?: string): string {
  const m = (raw || '').toLowerCase();
  if (m.includes('invalid login credentials')) return 'The email or password you entered is incorrect. Please double-check and try again.';
  if (m.includes('email not confirmed')) return 'Please confirm your email address first, then sign in.';
  if (m.includes('already registered') || m.includes('already been registered') || m.includes('already exists')) return 'An account with this email already exists — try signing in instead.';
  if (m.includes('failed to fetch') || m.includes('network')) return "Couldn't connect. Please check your internet connection and try again.";
  if (m.includes('too many') || m.includes('rate limit')) return 'Too many attempts. Please wait a minute and try again.';
  if (m.includes('password should be') || m.includes('at least 6')) return 'Your password is too short — please use at least 8 characters.';
  if (m.includes('unable to validate email') || m.includes('invalid email')) return 'That email address doesn’t look right. Please check it and try again.';
  return raw || 'Something went wrong. Please try again.';
}

export function AuthScreen() {
  const auth = useAuth();
  const [step, setStep] = useState<Step>('choose');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // shared fields
  const [role, setRole] = useState<AppRole>('individual');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [channel, setChannel] = useState<'email' | 'sms'>('email');
  const [orgName, setOrgName] = useState('');
  const [code, setCode] = useState('');

  const run = async (fn: () => Promise<void>) => {
    setError('');
    setBusy(true);
    try {
      await fn();
    } catch (e: any) {
      // Inline error — works on web (Alert.alert is a no-op there) and native.
      setError(friendlyAuthError(e?.message));
    } finally {
      setBusy(false);
    }
  };

  const doSignUp = () =>
    run(async () => {
      await auth.signUp({ email: email.trim().toLowerCase(), password, role, fullName, phone: toUsE164(phone), verifyChannel: channel, orgName: orgName || undefined });
      setStep('verify');
      Alert.alert(
        channel === 'email' ? 'Check your email' : 'Check your texts',
        channel === 'email'
          ? 'We sent a 6-digit code to your email. Enter it below.'
          : 'We sent a 6-digit code by SMS. Enter it below.',
      );
    });

  const doVerify = () =>
    run(async () => {
      if (channel === 'email') await auth.verifyEmailOtp(email, code.trim());
      else await auth.verifySmsOtp(toUsE164(phone) || phone, code.trim());
      // onAuthStateChange will flip the app to the signed-in state.
    });

  const doSignIn = () => run(() => auth.signIn(email.trim().toLowerCase(), password));

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <Text style={styles.emoji}>🌱</Text>
        <Text style={styles.title}>Sober Living Companion</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {step === 'choose' && (
          <View>
            <Text style={styles.lead}>Create an account to get started.</Text>
            {ROLES.map((r) => (
              <TouchableOpacity
                key={r.value}
                style={[styles.roleCard, role === r.value ? styles.roleActive : null]}
                onPress={() => setRole(r.value)}
                activeOpacity={0.8}
              >
                <Text style={styles.roleLabel}>{r.label}</Text>
                <Text style={styles.roleBlurb}>{r.blurb}</Text>
              </TouchableOpacity>
            ))}
            <View style={{ height: spacing.md }} />
            <Button title="Continue" onPress={() => setStep('signup')} />
            <TouchableOpacity onPress={() => setStep('signin')} style={styles.link}>
              <Text style={styles.linkText}>I already have an account</Text>
            </TouchableOpacity>
          </View>
        )}

        {step === 'signup' && (
          <View>
            <Field label="Full name" value={fullName} onChange={setFullName} placeholder="Your name" />
            {role === 'facilitator' ? (
              <Field label="Sober living name" value={orgName} onChange={setOrgName} placeholder="e.g. Brightwater Sober Living" />
            ) : null}
            <Field label="Email" value={email} onChange={setEmail} placeholder="you@example.com" keyboardType="email-address" />
            <Field label="Phone (for SMS verification)" value={phone} onChange={setPhone} placeholder="(555) 123-4567" keyboardType="phone-pad" />
            <Field label="Password" value={password} onChange={setPassword} placeholder="Choose a password" secure />

            <Text style={styles.fieldLabel}>Verify with</Text>
            <View style={styles.segment}>
              {(['email', 'sms'] as const).map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.segmentBtn, channel === c ? styles.segmentActive : null]}
                  onPress={() => setChannel(c)}
                >
                  <Text style={[styles.segmentText, channel === c ? styles.segmentTextActive : null]}>
                    {c === 'email' ? 'Email' : 'Text message'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={{ height: spacing.md }} />
            <Button
              title="Create account"
              onPress={doSignUp}
              disabled={busy || !email || !password || !fullName || (role === 'facilitator' && !orgName.trim())}
            />
            <BackLink onPress={() => setStep('choose')} />
          </View>
        )}

        {step === 'verify' && (
          <View>
            <Text style={styles.lead}>
              Enter the 6-digit code we sent to {channel === 'email' ? email : phone}.
            </Text>
            <Field label="Verification code" value={code} onChange={setCode} placeholder="123456" keyboardType="number-pad" />
            <Button title="Verify" onPress={doVerify} disabled={busy || code.length < 4} />
            <TouchableOpacity
              onPress={() => run(() => (channel === 'email' ? auth.requestEmailOtp(email) : auth.requestSmsOtp(toUsE164(phone) || phone)))}
              style={styles.link}
            >
              <Text style={styles.linkText}>Resend code</Text>
            </TouchableOpacity>
          </View>
        )}

        {step === 'signin' && (
          <View>
            <Field label="Email" value={email} onChange={setEmail} placeholder="you@example.com" keyboardType="email-address" />
            <Field label="Password" value={password} onChange={setPassword} placeholder="Your password" secure />
            <Button title="Sign in" onPress={doSignIn} disabled={busy || !email || !password} />
            <BackLink onPress={() => setStep('choose')} />
          </View>
        )}

        {busy ? <ActivityIndicator style={{ marginTop: spacing.lg }} color={colors.primary} /> : null}
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({
  label, value, onChange, placeholder, secure, keyboardType,
}: {
  label: string; value: string; onChange: (s: string) => void; placeholder?: string; secure?: boolean; keyboardType?: any;
}) {
  return (
    <View>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        secureTextEntry={secure}
        autoCapitalize="none"
        keyboardType={keyboardType}
      />
    </View>
  );
}

function BackLink({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.link}>
      <Text style={styles.linkText}>Back</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl * 2, flexGrow: 1 },
  emoji: { fontSize: 48, textAlign: 'center', marginTop: spacing.lg },
  title: { ...typography.h1, textAlign: 'center', marginBottom: spacing.lg },
  lead: { ...typography.bodySecondary, marginBottom: spacing.md },
  roleCard: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 2, borderColor: colors.border },
  roleActive: { borderColor: colors.primary },
  roleLabel: { ...typography.h3 },
  roleBlurb: { ...typography.caption, marginTop: 2 },
  fieldLabel: { ...typography.bodySecondary, fontWeight: '600', marginTop: spacing.md, marginBottom: spacing.xs },
  input: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, fontSize: 16, color: colors.textPrimary, borderWidth: 1, borderColor: colors.border },
  segment: { flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: 4 },
  segmentBtn: { flex: 1, paddingVertical: spacing.sm, alignItems: 'center', borderRadius: radius.sm },
  segmentActive: { backgroundColor: colors.surface },
  segmentText: { color: colors.textSecondary, fontWeight: '600' },
  segmentTextActive: { color: colors.primary },
  link: { alignItems: 'center', paddingVertical: spacing.md },
  linkText: { color: colors.primary, fontWeight: '600' },
  error: { color: colors.crisis, backgroundColor: '#FCECEA', borderRadius: radius.md, padding: spacing.sm, marginBottom: spacing.md, textAlign: 'center', fontWeight: '600' },
});
