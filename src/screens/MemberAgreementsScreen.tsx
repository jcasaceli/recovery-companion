import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Card, SectionTitle } from '../components/ui';
import { colors, spacing, radius, typography, shadow } from '../theme';
import { listMyAgreements, Agreement } from '../services/db';
import { formatDate } from '../utils/format';

export function MemberAgreementsScreen() {
  const nav = useNavigation<any>();
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      listMyAgreements()
        .then((a) => { if (alive) { setAgreements(a); setLoading(false); } })
        .catch(() => { if (alive) setLoading(false); });
      return () => { alive = false; };
    }, []),
  );

  const pending = agreements.filter((a) => a.status !== 'signed');
  const signed = agreements.filter((a) => a.status === 'signed');

  const Row = (a: Agreement) => (
    <TouchableOpacity
      key={a.id}
      style={styles.row}
      activeOpacity={0.7}
      onPress={() => nav.navigate('AgreementView', { id: a.id, canSign: a.status !== 'signed' })}
    >
      <Text style={styles.docIcon}>📄</Text>
      <View style={{ flex: 1 }}>
        <Text style={typography.h3}>{a.title}</Text>
        <Text style={[typography.caption, { color: a.status === 'signed' ? colors.success : colors.warning }]}>
          {a.status === 'signed' ? `✓ Signed${a.signedAt ? ` · ${formatDate(a.signedAt)}` : ''}` : '⏳ Tap to review & sign'}
        </Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={typography.h1}>Agreements</Text>
        {loading ? (
          <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
        ) : agreements.length === 0 ? (
          <Card><Text style={typography.bodySecondary}>No agreements yet. Your facilitator will send any membership agreements here for you to sign.</Text></Card>
        ) : (
          <>
            {pending.length ? <><SectionTitle>Needs your signature</SectionTitle>{pending.map(Row)}</> : null}
            {signed.length ? <><SectionTitle>Signed</SectionTitle>{signed.map(Row)}</> : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.md, paddingBottom: spacing.xxl },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, ...shadow.card },
  docIcon: { fontSize: 26, marginRight: spacing.md },
  chevron: { fontSize: 28, color: colors.textMuted, marginLeft: spacing.sm },
});
