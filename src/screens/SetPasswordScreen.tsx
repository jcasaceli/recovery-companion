import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Alert, ActivityIndicator } from 'react-native';
import { Screen, ScreenTitle, Card, Button } from '../components/ui';
import { colors, spacing, radius, typography } from '../theme';
import { useAuth } from '../state/auth';
import { updatePassword } from '../services/db';

/**
 * Shown when the app is opened from a password-reset link. The recovery link
 * already established a session, so here we just collect a NEW password and
 * save it — instead of silently dropping the user into the app.
 */
export function SetPasswordScreen() {
  const auth = useAuth();
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (pw1.length < 6) { Alert.alert('Too short', 'Use at least 6 characters.'); return; }
    if (pw1 !== pw2) { Alert.alert('Passwords don’t match', 'Re-enter the same password twice.'); return; }
    setBusy(true);
    try {
      await updatePassword(pw1);
      auth.completeRecovery();
      await auth.refreshProfile(); // clears the must-change-password gate
      Alert.alert('Password updated ✅', 'You’re all set — you’re now signed in.');
    } catch (e: any) {
      Alert.alert('Could not update password', e?.message ?? 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ScreenTitle title="Set a new password" />
      <Card>
        <Text style={[typography.body, { marginBottom: spacing.md }]}>
          {auth.profile?.email ? `For ${auth.profile.email}. ` : ''}Choose a new password to finish resetting your account.
        </Text>
        <Text style={[typography.caption, { marginBottom: spacing.xs }]}>New password (at least 6 characters)</Text>
        <TextInput
          style={styles.input}
          value={pw1}
          onChangeText={setPw1}
          placeholder="New password"
          placeholderTextColor={colors.textMuted}
          secureTextEntry
          autoCapitalize="none"
        />
        <TextInput
          style={styles.input}
          value={pw2}
          onChangeText={setPw2}
          placeholder="Confirm new password"
          placeholderTextColor={colors.textMuted}
          secureTextEntry
          autoCapitalize="none"
        />
        <Button title={busy ? 'Saving…' : 'Save new password'} onPress={save} disabled={busy || !pw1 || !pw2} />
        {busy ? <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.sm }} /> : null}
        {auth.profile?.mustChangePassword ? null : (
          <View style={{ alignItems: 'center', marginTop: spacing.md }}>
            <Text style={typography.caption} onPress={() => auth.completeRecovery()}>
              Skip for now
            </Text>
          </View>
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 16,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
});
