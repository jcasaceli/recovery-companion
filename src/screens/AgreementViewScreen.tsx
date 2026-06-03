import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Image, ScrollView, TextInput, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Card, SectionTitle, Button } from '../components/ui';
import { SignaturePad, SignatureView } from '../components/SignaturePad';
import { colors, spacing, radius, typography } from '../theme';
import { getAgreement, signAgreement, Agreement } from '../services/db';
import { formatDateTime } from '../utils/format';

export function AgreementViewScreen() {
  const route = useRoute<any>();
  const nav = useNavigation<any>();
  const { id, canSign } = route.params ?? {};

  const [agreement, setAgreement] = useState<Agreement | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [paths, setPaths] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getAgreement(id).then((a) => { setAgreement(a); setLoading(false); }).catch(() => setLoading(false));
  }, [id]);

  const submit = async () => {
    if (!name.trim() || paths.length === 0) return;
    setBusy(true);
    try {
      await signAgreement(id, paths, name.trim());
      Alert.alert('Signed ✅', 'Your signed agreement was sent to your facilitator.');
      nav.goBack();
    } catch (e: any) {
      Alert.alert('Could not sign', e?.message ?? 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <SafeAreaView style={styles.screen} edges={['bottom']}><ActivityIndicator style={{ marginTop: spacing.xxl }} color={colors.primary} /></SafeAreaView>;
  }
  if (!agreement) {
    return <SafeAreaView style={styles.screen} edges={['bottom']}><Text style={[typography.body, { padding: spacing.md }]}>Agreement not found.</Text></SafeAreaView>;
  }

  const Document = (
    <Card>
      <Text style={[typography.h3, { marginBottom: spacing.sm }]}>{agreement.title}</Text>
      {agreement.documentData ? (
        <Image source={{ uri: agreement.documentData }} style={styles.doc} resizeMode="contain" />
      ) : (
        <Text style={typography.bodySecondary}>No document image attached.</Text>
      )}
    </Card>
  );

  // Read-only: already signed, or a facilitator viewing.
  if (agreement.status === 'signed' || !canSign) {
    return (
      <SafeAreaView style={styles.screen} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {Document}
          {agreement.status === 'signed' ? (
            <>
              <SectionTitle>Signature</SectionTitle>
              <Card>
                <SignatureView paths={agreement.signaturePaths ?? []} />
                <Text style={[typography.caption, { marginTop: spacing.sm }]}>
                  Signed by {agreement.signerName ?? 'resident'}
                  {agreement.signedAt ? ` · ${formatDateTime(agreement.signedAt)}` : ''}
                </Text>
              </Card>
            </>
          ) : (
            <Card><Text style={[typography.body, { color: colors.warning }]}>⏳ Awaiting the resident's signature.</Text></Card>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Sign mode (member, pending): document scrolls up top, signature fixed below.
  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {Document}
        <Text style={[typography.caption, { paddingHorizontal: spacing.md }]}>
          Read the agreement above. By signing, you agree to its terms.
        </Text>
      </ScrollView>
      <View style={styles.signArea}>
        <Text style={styles.label}>Your full legal name</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="First and last name" placeholderTextColor={colors.textMuted} autoCapitalize="words" />
        <Text style={styles.label}>Signature</Text>
        <SignaturePad height={160} onChange={setPaths} />
        <Button title={busy ? 'Signing…' : 'Sign agreement'} onPress={submit} disabled={busy || !name.trim() || paths.length === 0} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.md, paddingBottom: spacing.lg },
  doc: { width: '100%', height: 380, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  signArea: { padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  label: { ...typography.caption, marginBottom: spacing.xs },
  input: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, fontSize: 16, color: colors.textPrimary, marginBottom: spacing.sm },
});
