import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, typography } from '../theme';
import { Button } from '../components/ui';
import { useAuth } from '../state/auth';
import { AppRole } from '../types';
import { toUsE164 } from '../utils/format';

const WEB_SIGNUP_URL = 'https://soberlivingcompanion.com';

// Resident-first onboarding: the app opens straight into a free resident
// sign-up (name + email + password → instant login). An "owner" path is a
// secondary option. Existing accounts are unaffected — only new sign-ups see
// this, and both paths still create the same roles as before.
type Step = 'resident' | 'owner' | 'signin';

/** Turn raw auth errors into friendly, human messages. */
function friendlyAuthError(raw?: string): string {
  const m = (raw || '').toLowerCase();
  if (m.includes('invalid login credentials')) return 'The email or password you entered is incorrect. Please double-check and try again.';
  if (m.includes('email not confirmed')) return 'Please confirm your email address first, then sign in.';
  if (m.includes('already registered') || m.includes('already been registered') || m.includes('already exists')) return 'An account with this email already exists — try signing in instead. If you claimed a listing on soberlivingdirectory.com, it’s the same account: sign in with that email and password (or reset it if you’ve forgotten it).';
  if (m.includes('failed to fetch') || m.includes('network')) return "Couldn't connect. Please check your internet connection and try again.";
  if (m.includes('too many') || m.includes('rate limit')) return 'Too many attempts. Please wait a minute and try again.';
  if (m.includes('password should be') || m.includes('at least 6')) return 'Your password is too short — please use at least 8 characters.';
  if (m.includes('unable to validate email') || m.includes('invalid email')) return 'That email address doesn’t look right. Please check it and try again.';
  return raw || 'Something went wrong. Please try again.';
}

export function AuthScreen() {
  const auth = useAuth();
  const [step, setStep] = useState<Step>('resident');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // shared fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [channel] = useState<'email' | 'sms'>('email'); // verification is email-only
  const [orgName, setOrgName] = useState('');
  const [houseName, setHouseName] = useState('');

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

  const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();

  const doSignUp = (role: AppRole) =>
    run(async () => {
      const signedIn = await auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        role,
        fullName: fullName || (role === 'facilitator' ? orgName.trim() : ''),
        phone: phone.trim() ? toUsE164(phone) : undefined,
        verifyChannel: channel,
        orgName: role === 'facilitator' ? (orgName || undefined) : undefined,
        houseName: role === 'facilitator' ? (houseName || undefined) : undefined,
      });
      // With email confirmation off (current setting), signUp returns a session
      // and onAuthStateChange flips the app to signed-in automatically — the
      // resident lands straight on Home. If confirmation is ever turned on,
      // there's no session yet, so we send them to sign in.
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

        {step === 'resident' && (
          <View>
            <Text style={styles.lead}>Start free — track your sober days, find meetings, sign forms, and more. You can join your sober living later with a code.</Text>
            <View style={styles.nameRow}>
              <View style={{ flex: 1 }}>
                <Field label="First name" value={firstName} onChange={setFirstName} placeholder="First" autoCap="words" />
              </View>
              <View style={{ width: spacing.sm }} />
              <View style={{ flex: 1 }}>
                <Field label="Last name" value={lastName} onChange={setLastName} placeholder="Last" autoCap="words" />
              </View>
            </View>
            <Field label="Email" value={email} onChange={setEmail} placeholder="you@example.com" keyboardType="email-address" />
            <Field label="Password" value={password} onChange={setPassword} placeholder="Choose a password" secure />

            <View style={{ height: spacing.md }} />
            <Button
              title="Create my free account"
              onPress={() => doSignUp('individual')}
              disabled={busy || !email || !password || !firstName.trim() || !lastName.trim()}
            />
            <TouchableOpacity onPress={() => setStep('signin')} style={styles.link}>
              <Text style={styles.linkText}>I already have an account — sign in</Text>
            </TouchableOpacity>

            <View style={styles.ownerCard}>
              <Text style={styles.ownerTitle}>Own a sober living?</Text>
              <Text style={styles.ownerBlurb}>Manage your houses, members, payments, forms &amp; more from an admin profile.</Text>
              <TouchableOpacity onPress={() => { setError(''); setStep('owner'); }} style={styles.ownerBtn}>
                <Text style={styles.ownerBtnText}>Set up an admin account →</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {step === 'owner' && (
          <View>
            <Text style={styles.lead}>Manage your sober living — houses, members, payments, forms, agreements &amp; more.</Text>
            <View style={styles.nameRow}>
              <View style={{ flex: 1 }}>
                <Field label="First name" value={firstName} onChange={setFirstName} placeholder="First" autoCap="words" />
              </View>
              <View style={{ width: spacing.sm }} />
              <View style={{ flex: 1 }}>
                <Field label="Last name" value={lastName} onChange={setLastName} placeholder="Last" autoCap="words" />
              </View>
            </View>
            <Field label="Organization name" value={orgName} onChange={setOrgName} placeholder="e.g. All-In Recovery Homes" />
            <Field label="House name" value={houseName} onChange={setHouseName} placeholder="e.g. Middletown House #1" />
            <Text style={styles.hint}>Have more houses? You can add them later in the app.</Text>
            <Field label="Email" value={email} onChange={setEmail} placeholder="you@example.com" keyboardType="email-address" />
            <Field label="Phone (optional)" value={phone} onChange={setPhone} placeholder="(555) 123-4567" keyboardType="phone-pad" />
            <Field label="Password" value={password} onChange={setPassword} placeholder="Choose a password" secure />
            <Text style={styles.hint}>Already claimed a listing on soberlivingdirectory.com? That’s the same account — sign in instead.</Text>

            <View style={{ height: spacing.md }} />
            <Button
              title="Create admin account"
              onPress={() => doSignUp('facilitator')}
              disabled={busy || !email || !password || !firstName.trim() || !orgName.trim()}
            />
            <TouchableOpacity onPress={() => setStep('signin')} style={styles.link}>
              <Text style={styles.linkText}>Already have an account? Sign in</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={openWebSignup} style={styles.link}>
              <Text style={styles.linkText}>Prefer the web dashboard? Sign up at soberlivingcompanion.com</Text>
            </TouchableOpacity>
            <BackLink onPress={() => { setError(''); setStep('resident'); }} />
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
            <Text style={[styles.hint, { textAlign: 'center', marginTop: spacing.sm }]}>If you claimed a listing on soberlivingdirectory.com, your login here is the same email and password. Don’t remember it? Tap “Forgot password?” to reset it.</Text>
            <BackLink onPress={() => setStep('resident')} />
          </View>
        )}

        {busy ? <ActivityIndicator style={{ marginTop: spacing.lg }} color={colors.primary} /> : null}

        <TouchableOpacity onPress={openWebSignup} style={styles.siteLinkWrap}>
          <Text style={styles.siteLink}>Visit soberlivingcompanion.com →</Text>
        </TouchableOpacity>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({
  label, value, onChange, placeholder, secure, keyboardType, autoCap,
}: {
  label: string; value: string; onChange: (s: string) => void; placeholder?: string; secure?: boolean; keyboardType?: any; autoCap?: 'none' | 'words';
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
          autoCapitalize={autoCap ?? 'none'}
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
  nameRow: { flexDirection: 'row' },
  ownerCard: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.lg, borderWidth: 1, borderColor: colors.border },
  ownerTitle: { ...typography.h3, fontSize: 16 },
  ownerBlurb: { ...typography.caption, marginTop: 2, marginBottom: spacing.sm },
  ownerBtn: { alignSelf: 'flex-start' },
  ownerBtnText: { color: colors.primary, fontWeight: '800' },
  fieldLabel: { ...typography.bodySecondary, fontWeight: '600', marginTop: spacing.md, marginBottom: spacing.xs },
  hint: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },
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
  siteLinkWrap: { alignItems: 'center', paddingVertical: spacing.lg, marginTop: spacing.lg },
  siteLink: { color: colors.primary, fontWeight: '800', textDecorationLine: 'underline' },
});
