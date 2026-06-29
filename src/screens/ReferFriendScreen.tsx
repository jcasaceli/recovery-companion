import React from 'react';
import { View, Text, StyleSheet, Share, Platform, Linking } from 'react-native';
import { Screen, ScreenTitle, Card, Button } from '../components/ui';
import { colors, spacing, typography } from '../theme';

const SITE = 'https://soberlivingcompanion.com';
const MSG =
  `I use Sober Living Companion to run my sober living — residents track their recovery, sign agreements, and pay rent from their phone. ` +
  `Check it out: ${SITE}`;

/** Simple referral screen — share the product with another operator. */
export function ReferFriendScreen() {
  const share = async () => {
    try {
      if (Platform.OS === 'web' && !(navigator as any).share) {
        const g: any = globalThis;
        await g.navigator?.clipboard?.writeText?.(MSG);
        return;
      }
      await Share.share({ message: MSG });
    } catch {}
  };

  return (
    <Screen>
      <ScreenTitle title="Refer a friend" subtitle="Know another sober living operator? Send them Sober Living Companion." />
      <Card>
        <Text style={[typography.h3, { marginBottom: spacing.sm }]}>Spread the word 🎁</Text>
        <Text style={[typography.body, { marginBottom: spacing.md }]}>
          Share Sober Living Companion with another house owner or manager. They can sign up free and start managing
          residents, agreements, and rent right away.
        </Text>
        <View style={styles.linkBox}>
          <Text selectable style={[typography.body, { color: colors.primaryDark, fontWeight: '700' }]}>{SITE}</Text>
        </View>
        <Button title="📤 Share the link" onPress={share} />
        <View style={{ height: spacing.sm }} />
        <Button title="Open the website" variant="secondary" onPress={() => Linking.openURL(SITE)} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  linkBox: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
});
