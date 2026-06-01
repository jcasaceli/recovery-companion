import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { Screen, ScreenTitle, Card, SectionTitle } from '../components/ui';
import { colors, spacing, typography } from '../theme';
import { CrisisResources } from '../components/CrisisResources';

interface SupportLink {
  title: string;
  description: string;
  url: string;
}

const FAMILY_SUPPORT: SupportLink[] = [
  {
    title: 'Al-Anon Family Groups',
    description: 'Support meetings for families and friends of people with a drinking problem.',
    url: 'https://al-anon.org',
  },
  {
    title: 'Nar-Anon Family Groups',
    description: 'Support for families affected by someone else’s addiction.',
    url: 'https://www.nar-anon.org',
  },
  {
    title: 'NAMI (Mental Health)',
    description: 'National Alliance on Mental Illness — education and family support.',
    url: 'https://www.nami.org',
  },
  {
    title: 'Partnership to End Addiction',
    description: 'A free helpline and resources for parents and caregivers.',
    url: 'https://drugfree.org',
  },
];

const LEARN: SupportLink[] = [
  {
    title: 'Understanding levels of care',
    description: 'Detox, inpatient, PHP, IOP, outpatient — what each one means.',
    url: 'https://www.samhsa.gov/find-help/recovery',
  },
  {
    title: 'Supporting recovery as a family',
    description: 'How to set boundaries while staying connected and supportive.',
    url: 'https://drugfree.org/article/how-to-help-your-child-or-loved-one/',
  },
];

export function ResourcesScreen() {
  return (
    <Screen>
      <ScreenTitle title="Resources" subtitle="Help for you and your loved one" />

      <CrisisResources />

      <SectionTitle>Family support</SectionTitle>
      {FAMILY_SUPPORT.map((r) => (
        <LinkCard key={r.title} item={r} />
      ))}

      <SectionTitle>Learn</SectionTitle>
      {LEARN.map((r) => (
        <LinkCard key={r.title} item={r} />
      ))}

      <Text style={styles.disclaimer}>
        These resources are for information and support only and are not medical
        advice. For care decisions, talk with your loved one's treatment team.
      </Text>
    </Screen>
  );
}

function LinkCard({ item }: { item: SupportLink }) {
  return (
    <Card onPress={() => Linking.openURL(item.url).catch(() => {})}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={typography.h3}>{item.title}</Text>
          <Text style={[typography.bodySecondary, { marginTop: 2 }]}>
            {item.description}
          </Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  chevron: { fontSize: 28, color: colors.textMuted, marginLeft: spacing.sm },
  disclaimer: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: spacing.md,
    lineHeight: 17,
  },
});
