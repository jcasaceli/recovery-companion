import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, typography } from '../theme';
import { Button } from '../components/ui';
import { useAuth } from '../state/auth';
import { AppRole } from '../types';
import { toUsE164 } from '../utils/format';

const ROLES: { value: AppRole; label: string; blurb: string }[] = [
  { value: 'individual', label: 'I am a member of a sober living network', blurb: 'Track progress, pay membership fees, and find meetings.' },
  { value: 'facilitator', label: "I'm a sober living owner/manager", blurb: 'Manage your house(s), members, payments, forms & agreements.' },
];

const WEB_SIGNUP_URL = 'https://soberlivingcompanion.com';

type Step = 'choose' | 'signin' | 'signup';

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
  const [channel] = useState<'email' | 'sms'>('email'); // verification is email-only
  const [orgName, setOrgName] = useState('');

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
      const signedIn = await auth.signUp({ email: email.trim().toLowerCase(), password, role, fullName, phone: toUsE164(phone), verifyChannel: channel, orgName: orgName || undefined });
      // With email confirmation off, signUp returns a session and
      // onAuthStateChange flips the app to signed-in automatically. If
      // confirmation is on, there's no session yet — send them to sign in.
      if (!signedIn) {
        Alert.alert('Account created', 'If asked, confirm your email from the link we sent, then sign in.');
        setStep('signin');
      }
    });

  const doSignIn = () => run(() => auth.signIn(email.trim().toLowerCase(), password));

  const openWebSignup = () => Linking.openURL(WEB_SIGNUP_URL).catch(() => {});

  const doForgot = () => {
    if (!email.trim()) { setError('Enter your email above first, then tap “Forgot password?”'); return; }
    run(async () => {
      await auth.resetPassword(email.trim().toLowerCase());
      Alert.alert('Check your email', 'We sent you a link to reset your password. Open it, choose a new password, then come back and sign in.');
    });
  };

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
              <Field label="Sober living name (your first house)" value={orgName} onChange={setOrgName} placeholder="e.g. Brightwater Sober Living" />
            ) : null}
            <Field label="Email" value={email} onChange={setEmail} placeholder="you@example.com" keyboardType="email-address" />
            <Field
              label={role === 'individual' ? 'Phone' : 'Phone (optional)'}
              value={phone}
              onChange={setPhone}
              placeholder="(555) 123-4567"
              keyboardType="phone-pad"
            />
            <Field label="Password" value={password} onChange={setPassword} placeholder="Choose a password" secure />

            <View style={{ height: spacing.md }} />
            <Button
              title="Create account"
              onPress={doSignUp}
              disabled={
                busy || !email || !password || !fullName ||
                (role === 'individual' && !phone.trim()) ||
                (role === 'facilitator' && !orgName.trim())
              }
            />
            {role === 'facilitator' ? (
              <TouchableOpacity onPress={openWebSignup} style={styles.link}>
                <Text style={styles.linkText}>Prefer the web dashboard? Sign up at soberlivingcompanion.com</Text>
              </TouchableOpacity>
            ) : null}
            <BackLink onPress={() => setStep('choose')} />
          </View>
        )}

        {step === 'signin' && (
          <View>
            <Field label="Email" value={email} onChange={setEmail} placeholder="you@example.com" keyboardType="email-address" />
            <Field label="Password" value={password} onChange={setPassword} placeholder="Your password" secure />
            <TouchableOpacity onPress={doForgot} style={styles.forgot} disabled={busy}>
              <Text style={styles.linkText}>Forgot password?</Text>
            </TouchableOpacity>
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
  const [show, setShow] = useState(false);
  return (
    <View>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.inputWrap}>
        <TextInput
          style={[styles.input, secure ? styles.inputWithIcon : null]}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          secureTextEntry={secure && !show}
          autoCapitalize="none"
          keyboardType={keyboardType}
        />
        {secure ? (
          <TouchableOpacity
            style={styles.eyeBtn}
            onPress={() => setShow((s) => !s)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel={show ? 'Hide password' : 'Show password'}
          >
            <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={22} color={colors.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>
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
  inputWrap: { position: 'relative', justifyContent: 'center' },
  inputWithIcon: { paddingRight: 48 },
  eyeBtn: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 48, alignItems: 'center', justifyContent: 'center' },
  segment: { flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: 4 },
  segmentBtn: { flex: 1, paddingVertical: spacing.sm, alignItems: 'center', borderRadius: radius.sm },
  segmentActive: { backgroundColor: colors.surface },
  segmentText: { color: colors.textSecondary, fontWeight: '600' },
  segmentTextActive: { color: colors.primary },
  link: { alignItems: 'center', paddingVertical: spacing.md },
  forgot: { alignSelf: 'flex-end', paddingVertical: spacing.sm, marginBottom: spacing.xs },
  linkText: { color: colors.primary, fontWeight: '600' },
  error: { color: colors.crisis, backgroundColor: '#FCECEA', borderRadius: radius.md, padding: spacing.sm, marginBottom: spacing.md, textAlign: 'center', fontWeight: '600' },
});
