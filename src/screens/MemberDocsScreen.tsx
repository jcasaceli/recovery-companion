import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Linking, Platform } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import * as WebBrowser from 'expo-web-browser';
import { Screen, ScreenTitle, Card, SectionTitle, Pill } from '../components/ui';
import { colors, spacing, typography } from '../theme';
import { listMyAgreements, listMyFormResponses, listMyDocuments, getDocumentUrl, Agreement, FormResponse, Document } from '../services/db';
import { formatDate } from '../utils/format';

/**
 * One place for everything a resident needs to sign or view — agreements,
 * forms, and uploaded documents (ID/passport/etc.) all together.
 */
export function MemberDocsScreen() {
  const nav = useNavigation<any>();
  const [agr, setAgr] = useState<Agreement[]>([]);
  const [forms, setForms] = useState<FormResponse[]>([]);
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      listMyAgreements().then(setAgr).catch(() => {}),
      listMyFormResponses().then(setForms).catch(() => {}),
      listMyDocuments().then(setDocs).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const pendingAgr = agr.filter((a) => a.status !== 'signed');
  const pendingForms = forms.filter((f) => f.status !== 'completed');
  const doneAgr = agr.filter((a) => a.status === 'signed');
  const doneForms = forms.filter((f) => f.status === 'completed');

  const openDoc = async (d: Document) => {
    try {
      if (!d.storagePath) return;
      const url = await getDocumentUrl(d.storagePath);
      if (!url) return;
      if (Platform.OS === 'web') Linking.openURL(url);
      else await WebBrowser.openBrowserAsync(url);
    } catch {}
  };

  const Row = ({ title, sub, tag, tagColor, onPress }: { title: string; sub?: string; tag?: string; tagColor?: string; onPress?: () => void }) => (
    <TouchableOpacity style={styles.row} activeOpacity={onPress ? 0.7 : 1} onPress={onPress} disabled={!onPress}>
      <View style={{ flex: 1 }}>
        <Text style={[typography.body, { fontWeight: '600' }]}>{title}</Text>
        {sub ? <Text style={typography.caption}>{sub}</Text> : null}
      </View>
      {tag ? <Pill label={tag} color={tagColor || colors.warning} /> : <Text style={styles.chev}>›</Text>}
    </TouchableOpacity>
  );

  return (
    <Screen>
      <ScreenTitle title="Documents" subtitle="Your agreements, forms, and files — all in one place." />
      {loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.lg }} /> : null}

      {(pendingAgr.length + pendingForms.length) > 0 ? (
        <>
          <SectionTitle>Needs your signature</SectionTitle>
          <Card>
            {pendingAgr.map((a) => (
              <Row key={a.id} title={a.title} sub="Agreement" tag="Sign" tagColor={colors.primary}
                onPress={() => nav.navigate('AgreementView', { id: a.id, canSign: true })} />
            ))}
            {pendingForms.map((f) => (
              <Row key={f.id} title={f.title} sub="Form" tag="Fill out" tagColor={colors.primary}
                onPress={() => nav.navigate('FormFill', { id: f.id })} />
            ))}
          </Card>
        </>
      ) : null}

      <SectionTitle>Completed</SectionTitle>
      <Card>
        {doneAgr.length + doneForms.length === 0 ? (
          <Text style={typography.caption}>Nothing signed yet.</Text>
        ) : (
          <>
            {doneAgr.map((a) => (
              <Row key={a.id} title={a.title} sub={`Signed${a.signedAt ? ` · ${formatDate(a.signedAt)}` : ''}`} tag="Signed" tagColor={colors.success}
                onPress={() => nav.navigate('AgreementView', { id: a.id, canSign: false })} />
            ))}
            {doneForms.map((f) => (
              <Row key={f.id} title={f.title} sub="Completed" tag="Done" tagColor={colors.success}
                onPress={() => nav.navigate('FormFill', { id: f.id })} />
            ))}
          </>
        )}
      </Card>

      <SectionTitle>Your files</SectionTitle>
      <Card>
        {docs.length === 0 ? (
          <Text style={typography.caption}>No files yet. Your house may upload things like your ID or house rules here.</Text>
        ) : (
          docs.map((d) => (
            <Row key={d.id} title={d.fileName || 'Document'} sub={d.createdAt ? formatDate(d.createdAt) : undefined} onPress={() => openDoc(d)} />
          ))
        )}
      </Card>
      <View style={{ height: spacing.xl }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  chev: { color: colors.textMuted, fontSize: 20 },
});
