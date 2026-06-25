import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { colors, spacing, radius, typography } from '../theme';
import { Button } from '../components/ui';
import { useAppState } from '../state/store';
import { redeemJoinCode, redeemOrgCode, getMyNetworkName } from '../services/db';

/** Connect-to-a-sober-living screen, shown as a modal from the "Enter sober
 *  living code" banner. A member can use the whole app without a code; entering
 *  one here links their account to their sober living's community. */
export function LinkMemberScreen() {
  const navigation = useNavigation<any>();
  const { reloadCloud } = useAppState();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [linkedName, setLinkedName] = useState<string | null>(null); // success view when set

  const close = () => {
    if (navigation.canGoBack()) navigation.goBack();
  };

  const link = async () => {
    if (!code.trim()) return;
    setBusy(true);
    try {
      // A facilitator-invited member gets a PER-MEMBER code that links them to
      // the exact resident record their house manages (so agreements, forms &
      // fees show up). Try that first; fall back to an org-wide code, which
      // creates a fresh record for self-join members.
      try {
        await redeemJoinCode(code);
      } catch {
        await redeemOrgCode(code);
      }
      await reloadCloud(); // pulls in the linked record → app unlocks community
      const name = await getMyNetworkName().catch(() => null);
      setLinkedName(name && name.trim() ? name.trim() : 'your sober living network');
    } catch (e: any) {
      Alert.alert('Could not connect', e?.message ?? 'Check the code and try again.');
    } finally {
      setBusy(false);
    }
  };

  // ----- Success state -----
  if (linkedName) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <View style={styles.content}>
          <Text style={styles.emoji}>🎉</Text>
          <Text style={styles.title}>You're connected!</Text>
          <Text style={styles.lead}>
            You are now connected to{' '}
            <Text style={styles.network}>{linkedName}</Text>!
          </Text>
          <Text style={styles.leadSmall}>
            Welcome to the community. Your home can now share updates, agreements,
            and membership info with you here.
          </Text>
          <View style={{ height: spacing.lg }} />
          <Button title="Continue to the app" onPress={close} />
        </View>
      </SafeAreaView>
    );
  }

  // ----- Entry state -----
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <Text style={styles.emoji}>🔗</Text>
        <Text style={styles.title}>Connect to your sober living</Text>
        <Text style={styles.lead}>
          Enter the code your sober living gave you. This connects your account to
          their community so you can see agreements, documents, and pay membership
          fees. You can keep using the rest of the app either way.
        </Text>

        <TextInput
          style={styles.input}
          value={code}
          onChangeText={setCode}
          placeholder="Sober living code (e.g. 7QK2P9)"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="characters"
          autoCorrect={false}
        />
        <Button title="Connect" onPress={link} disabled={busy || !code.trim()} />
        {busy ? <ActivityIndicator style={{ marginTop: spacing.md }} color={colors.primary} /> : null}

        <TouchableOpacity onPress={close} style={styles.link}>
          <Text style={styles.linkText}>Maybe later</Text>
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
  lead: { ...typography.bodySecondary, textAlign: 'center', lineHeight: 22, marginBottom: spacing.sm },
  leadSmall: { ...typography.caption, textAlign: 'center', lineHeight: 20, marginTop: spacing.sm },
  network: { color: colors.primary, fontWeight: '800' },
  input: {
    backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md,
    fontSize: 20, letterSpacing: 2, textAlign: 'center', color: colors.textPrimary,
    borderWidth: 1, borderColor: colors.border, marginTop: spacing.lg, marginBottom: spacing.md,
  },
  link: { alignItems: 'center', paddingVertical: spacing.md, marginTop: spacing.sm },
  linkText: { color: colors.textSecondary, fontWeight: '600' },
});
