import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Share, Platform, Linking, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Screen, ScreenTitle, Card, Button, Pill } from '../components/ui';
import { colors, spacing, typography } from '../theme';
import { getMyReferrals, ReferralSummary } from '../services/db';
import { formatDate } from '../utils/format';

const SITE = 'https://soberlivingcompanion.com';
const MSG =
  `I use Sober Living Companion to run my sober living — residents track their recovery, sign agreements, and pay rent from their phone. ` +
  `Check it out: ${SITE}`;

/** Simple referral screen — share the product with another operator. */
const STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: 'Signed up', color: colors.warning },
  qualified: { label: 'Free month earned', color: colors.success },
  approved: { label: 'Credit applied', color: colors.success },
  rejected: { label: 'Not eligible', color: colors.textMuted },
};

export function ReferFriendScreen() {
  const [data, setData] = useState<ReferralSummary>({ referrals: [] });
  useFocusEffect(useCallback(() => {
    getMyReferrals().then(setData).catch(() => {});
  }, []));

  const msg = data.link
    ? `I use Sober Living Companion to run my sober living — residents track their recovery, sign agreements, and pay rent from their phone. Sign up with my link: ${data.link}`
    : MSG;

  const copyLink = async () => {
    if (!data.link) return;
    const g: any = globalThis;
    try { await g.navigator?.clipboard?.writeText?.(data.link); } catch {}
  };

  const share = async () => {
    try {
      if (Platform.OS === 'web' && !(navigator as any).share) {
        const g: any = globalThis;
        await g.navigator?.clipboard?.writeText?.(msg);
        return;
      }
      await Share.share({ message: msg });
    } catch {}
  };

  return (
    <Screen>
      <ScreenTitle title="Refer a friend" subtitle="Know another sober living operator? Send them Sober Living Companion." />
      <Card>
        <Text style={[typography.h3, { marginBottom: spacing.sm }]}>Spread the word 🎁</Text>
        <Text style={[typography.body, { marginBottom: spacing.md }]}>
          Share your personal link with another house owner or manager. If they subscribe,
          you get <Text style={{ fontWeight: '800' }}>one month free</Text>.
        </Text>
        <TouchableOpacity style={styles.linkBox} onPress={copyLink} activeOpacity={0.7}>
          <Text selectable style={[typography.body, { color: colors.primaryDark, fontWeight: '700' }]}>
            {data.link || SITE}
          </Text>
          {data.link ? <Text style={typography.caption}>Tap to copy · code {data.code}</Text> : null}
        </TouchableOpacity>
        <Button title="📤 Share my link" onPress={share} />
        <View style={{ height: spacing.sm }} />
        <Button title="Open the website" variant="secondary" onPress={() => Linking.openURL(data.link || SITE)} />
      </Card>

      {/* How their referrals are doing */}
      <Card>
        <Text style={[typography.h3, { marginBottom: spacing.sm }]}>Your referrals</Text>
        {data.referrals.length === 0 ? (
          <Text style={typography.bodySecondary}>
            No referrals yet. Share your link — you'll see them here as soon as someone signs up with it.
          </Text>
        ) : (
          data.referrals.map((r) => {
            const st = STATUS[r.status] ?? STATUS.pending;
            return (
              <View key={r.id} style={styles.refRow}>
                <View style={{ flex: 1 }}>
                  <Text style={typography.body}>{r.orgName || 'A sober living'}</Text>
                  <Text style={typography.caption}>Joined {formatDate(r.createdAt)}</Text>
                </View>
                <Pill label={st.label} color={st.color} />
              </View>
            );
          })
        )}
        <Text style={[typography.caption, { color: colors.textMuted, marginTop: spacing.sm }]}>
          A free month is earned once your referral's subscription starts. We'll email you and apply the credit to your next invoice.
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  refRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider,
  },
  linkBox: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
});
