import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, radius, typography } from '../theme';
import { Button } from '../components/ui';
import { useAppState } from '../state/store';
import { useAuth } from '../state/auth';
import { redeemOrgCode } from '../services/db';

/** Shown to a signed-in member who isn't linked to a sober living yet. They
 *  enter the join code their facilitator gave them to connect their account. */
export function LinkMemberScreen() {
  const { reloadCloud } = useAppState();
  const auth = useAuth();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const link = async () => {
    if (!code.trim()) return;
    setBusy(true);
    try {
      await redeemOrgCode(code);
      await reloadCloud(); // pulls in the linked record → app proceeds
    } catch (e: any) {
      Alert.alert('Could not link', e?.message ?? 'Check the code and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <Text style={styles.emoji}>🔗</Text>
        <Text style={styles.title}>Connect to your sober living</Text>
        <Text style={styles.lead}>
          Enter the join code your facilitator gave you. This links your account
          so you can see your info and pay rent.
        </Text>

        <TextInput
          style={styles.input}
          value={code}
          onChangeText={setCode}
          placeholder="Join code (e.g. 7QK2P9)"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="characters"
          autoCorrect={false}
        />
        <Button title="Connect" onPress={link} disabled={busy || !code.trim()} />
        {busy ? <ActivityIndicator style={{ marginTop: spacing.md }} color={colors.primary} /> : null}

        <TouchableOpacity onPress={() => auth.signOut()} style={styles.link}>
          <Text style={styles.linkText}>Sign out</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, justifyContent: 'center', padding: spacing.lg },
  emoji: { fontSize: 48, textAlign: 'center', marginBottom: spacing.md },
  title: { ...typography.h1, textAlign: 'center', marginBottom: spacing.sm },
  lead: { ...typography.bodySecondary, textAlign: 'center', lineHeight: 22, marginBottom: spacing.lg },
  input: {
    backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md,
    fontSize: 20, letterSpacing: 2, textAlign: 'center', color: colors.textPrimary,
    borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md,
  },
  link: { alignItems: 'center', paddingVertical: spacing.md, marginTop: spacing.sm },
  linkText: { color: colors.textSecondary, fontWeight: '600' },
});
