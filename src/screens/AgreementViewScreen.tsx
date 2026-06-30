import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Image, ScrollView, TextInput, Alert, ActivityIndicator, Modal, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Card, SectionTitle, Button } from '../components/ui';
import { SignaturePad, SignatureView } from '../components/SignaturePad';
import { colors, spacing, radius, typography } from '../theme';
import { getAgreement, signAgreement, signAgreementWithFields, Agreement, PlacedField } from '../services/db';
import { labelFor } from '../components/DocumentFieldEditor';
import { formatDateTime } from '../utils/format';

/** Best-effort public IP for the signing audit trail. */
async function fetchIp(): Promise<string | undefined> {
  try {
    const r = await fetch('https://api.ipify.org?format=json');
    const j = await r.json();
    return j?.ip;
  } catch {
    return undefined;
  }
}

export function AgreementViewScreen() {
  const route = useRoute<any>();
  const nav = useNavigation<any>();
  const { id, canSign } = route.params ?? {};

  const [agreement, setAgreement] = useState<Agreement | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [paths, setPaths] = useState<string[]>([]);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [viewer, setViewer] = useState(false); // full-screen document reader

  // Placed-field signing (iteration 2): boxes the facilitator dropped on the doc.
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  const [fieldValues, setFieldValues] = useState<Record<string, any>>({});
  const [activeField, setActiveField] = useState<PlacedField | null>(null);
  const [fieldPaths, setFieldPaths] = useState<string[]>([]);
  const [fieldText, setFieldText] = useState('');

  useEffect(() => {
    getAgreement(id).then((a) => { setAgreement(a); setFieldValues(a?.fieldValues ?? {}); setLoading(false); }).catch(() => setLoading(false));
  }, [id]);

  const hasFields = (agreement?.fields?.length ?? 0) > 0;
  const isSigField = (t: PlacedField['type']) => t === 'signature';
  const fieldFilled = (f: PlacedField) => {
    const v = fieldValues[f.key];
    return isSigField(f.type) ? !!(v && Array.isArray(v.paths) && v.paths.length) : !!(v && String(v).trim());
  };
  const openField = (f: PlacedField) => {
    setActiveField(f);
    const v = fieldValues[f.key];
    setFieldPaths(isSigField(f.type) && v?.paths ? v.paths : []);
    setFieldText(!isSigField(f.type) && typeof v === 'string' ? v : (f.type === 'date' ? new Date().toISOString().slice(0, 10) : ''));
  };
  const saveField = () => {
    if (!activeField) return;
    const val = isSigField(activeField.type) ? { paths: fieldPaths } : fieldText.trim();
    setFieldValues((prev) => ({ ...prev, [activeField.key]: val }));
    setActiveField(null);
  };
  const allRequiredFilled = () => (agreement?.fields ?? []).filter((f) => f.required !== false).every(fieldFilled);

  const submitFields = async () => {
    if (!name.trim()) { Alert.alert('Add your name', 'Type your full legal name.'); return; }
    if (!allRequiredFilled()) { Alert.alert('Fill every field', 'Tap each box on the document to sign or fill it in.'); return; }
    setBusy(true);
    try {
      const ip = await fetchIp();
      await signAgreementWithFields(id, fieldValues, name.trim(), ip);
      Alert.alert('Signed ✅', 'Your signed document was sent to your facilitator.');
      nav.goBack();
    } catch (e: any) {
      Alert.alert('Could not sign', e?.message ?? 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!name.trim() || paths.length === 0 || !agreed) return;
    setBusy(true);
    try {
      const ip = await fetchIp();
      await signAgreement(id, paths, name.trim(), ip);
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
        <>
          <TouchableOpacity activeOpacity={0.9} onPress={() => setViewer(true)}>
            <Image source={{ uri: agreement.documentData }} style={styles.doc} resizeMode="contain" />
          </TouchableOpacity>
          <Button title="🔍 Open & read full screen" variant="secondary" onPress={() => setViewer(true)} />
        </>
      ) : (
        <Text style={typography.bodySecondary}>No document image attached.</Text>
      )}
    </Card>
  );

  // Full-screen, pinch-zoomable reader (ScrollView zoom works on iOS & web).
  const Viewer = (
    <Modal visible={viewer} animationType="fade" onRequestClose={() => setViewer(false)}>
      <SafeAreaView style={styles.viewerScreen} edges={['top', 'bottom']}>
        <View style={styles.viewerBar}>
          <Text style={styles.viewerTitle} numberOfLines={1}>{agreement.title}</Text>
          <TouchableOpacity onPress={() => setViewer(false)} hitSlop={12}><Text style={styles.viewerClose}>Done</Text></TouchableOpacity>
        </View>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.viewerContent}
          maximumZoomScale={5}
          minimumZoomScale={1}
          centerContent
          showsVerticalScrollIndicator
        >
          {agreement.documentData ? (
            <Image source={{ uri: agreement.documentData }} style={styles.viewerImage} resizeMode="contain" />
          ) : null}
        </ScrollView>
        <Text style={styles.viewerHint}>Pinch to zoom · scroll to read</Text>
      </SafeAreaView>
    </Modal>
  );

  // Document with the facilitator's placed fields overlaid. `interactive` lets
  // the resident tap a box to sign/fill it.
  const DocWithFields = (interactive: boolean) => (
    <Card>
      <Text style={[typography.h3, { marginBottom: spacing.sm }]}>{agreement.title}</Text>
      {agreement.documentData ? (
        <View style={styles.fieldCanvas}>
          <Image
            source={{ uri: agreement.documentData }}
            style={styles.fieldImg}
            resizeMode="contain"
            onLayout={(e) => setImgSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
          />
          {imgSize.w > 0 && (agreement.fields ?? []).map((f) => {
            const filled = fieldFilled(f);
            const bs = { left: f.x * imgSize.w, top: f.y * imgSize.h, width: f.w * imgSize.w, height: f.h * imgSize.h };
            const inner = isSigField(f.type)
              ? <Text style={styles.fBoxInner}>{filled ? '✓ Signed' : 'Tap to sign'}</Text>
              : <Text style={styles.fBoxInner} numberOfLines={1}>{filled ? String(fieldValues[f.key]) : labelFor(f.type)}</Text>;
            return interactive ? (
              <TouchableOpacity key={f.key} style={[styles.fBox, bs, filled && styles.fBoxFilled]} onPress={() => openField(f)}>{inner}</TouchableOpacity>
            ) : (
              <View key={f.key} style={[styles.fBox, bs, filled && styles.fBoxFilled]} pointerEvents="none">{inner}</View>
            );
          })}
        </View>
      ) : (
        <Text style={typography.bodySecondary}>No document attached.</Text>
      )}
    </Card>
  );

  const SignatureList = () => {
    const sigs = (agreement.fields ?? []).filter((f) => isSigField(f.type) && fieldValues[f.key]?.paths?.length);
    if (!sigs.length) return null;
    return (
      <>
        <SectionTitle>Signatures</SectionTitle>
        {sigs.map((f) => (
          <Card key={f.key} style={styles.certCard}>
            <Text style={[typography.caption, { marginBottom: spacing.xs }]}>{f.label || labelFor(f.type)}</Text>
            <SignatureView paths={fieldValues[f.key].paths} />
          </Card>
        ))}
      </>
    );
  };

  const FieldSignModal = (
    <Modal visible={!!activeField} transparent animationType="fade" onRequestClose={() => setActiveField(null)}>
      <View style={styles.viewerContent2}>
        <View style={styles.fieldModal}>
          <Text style={typography.h3}>{activeField ? (activeField.label || labelFor(activeField.type)) : ''}</Text>
          {activeField && isSigField(activeField.type) ? (
            <>
              <Text style={[typography.caption, { marginVertical: spacing.xs }]}>Sign in the box below.</Text>
              <SignaturePad height={160} onChange={setFieldPaths} />
            </>
          ) : activeField ? (
            <>
              <Text style={[typography.caption, { marginVertical: spacing.xs }]}>
                {activeField.type === 'date' ? 'Enter the date.' : activeField.type === 'initials' ? 'Type your initials.' : 'Type your answer.'}
              </Text>
              <TextInput
                style={styles.input}
                value={fieldText}
                onChangeText={setFieldText}
                placeholder={activeField.type === 'initials' ? 'ABC' : activeField.type === 'date' ? '2026-01-31' : 'Type here'}
                placeholderTextColor={colors.textMuted}
                autoCapitalize={activeField.type === 'initials' ? 'characters' : 'sentences'}
              />
            </>
          ) : null}
          <Button title="Save" onPress={saveField} />
          <TouchableOpacity onPress={() => setActiveField(null)} style={{ alignItems: 'center', paddingVertical: spacing.sm }}><Text style={{ color: colors.textSecondary }}>Cancel</Text></TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  // ── Placed-field documents: sign each box in place ───────────────────────────
  if (hasFields) {
    const readOnly = agreement.status === 'signed' || !canSign;
    return (
      <SafeAreaView style={styles.screen} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {DocWithFields(!readOnly)}
          {readOnly ? (
            agreement.status === 'signed' ? (
              <>
                <SignatureList />
                <Card style={styles.certCard}>
                  <View style={styles.certMeta}>
                    <Text style={styles.certLabel}>Signed by</Text>
                    <Text style={styles.certValue}>{agreement.signerName ?? 'resident'}</Text>
                    {agreement.signedAt ? (<><Text style={styles.certLabel}>Date &amp; time</Text><Text style={styles.certValue}>{formatDateTime(agreement.signedAt)}</Text></>) : null}
                    {agreement.signedIp ? (<><Text style={styles.certLabel}>IP address</Text><Text style={styles.certValue}>{agreement.signedIp}</Text></>) : null}
                  </View>
                </Card>
              </>
            ) : (
              <Card><Text style={[typography.body, { color: colors.warning }]}>⏳ Awaiting the member's signature.</Text></Card>
            )
          ) : (
            <Card>
              <Text style={[typography.caption, { marginBottom: spacing.sm }]}>Tap each highlighted box on the document to sign or fill it in.</Text>
              <Text style={styles.label}>Your full legal name</Text>
              <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="First and last name" placeholderTextColor={colors.textMuted} autoCapitalize="words" />
              <Button title={busy ? 'Signing…' : 'Finish & submit'} onPress={submitFields} disabled={busy} />
              <Text style={styles.fine}>Your signature is recorded with the date, time, and IP address you signed from.</Text>
            </Card>
          )}
        </ScrollView>
        {FieldSignModal}
        {Viewer}
      </SafeAreaView>
    );
  }

  // ── Read-only: already signed, or a facilitator viewing ──────────────────────
  if (agreement.status === 'signed' || !canSign) {
    return (
      <SafeAreaView style={styles.screen} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {Document}
          {agreement.status === 'signed' ? (
            <>
              <SectionTitle>Signature</SectionTitle>
              <Card style={styles.certCard}>
                <SignatureView paths={agreement.signaturePaths ?? []} />
                <View style={styles.certMeta}>
                  <Text style={styles.certLabel}>Signed by</Text>
                  <Text style={styles.certValue}>{agreement.signerName ?? 'resident'}</Text>
                  {agreement.signedAt ? (<><Text style={styles.certLabel}>Date &amp; time</Text><Text style={styles.certValue}>{formatDateTime(agreement.signedAt)}</Text></>) : null}
                  {agreement.signedIp ? (<><Text style={styles.certLabel}>IP address</Text><Text style={styles.certValue}>{agreement.signedIp}</Text></>) : null}
                </View>
              </Card>
            </>
          ) : (
            <Card><Text style={[typography.body, { color: colors.warning }]}>⏳ Awaiting the member's signature.</Text></Card>
          )}
        </ScrollView>
        {Viewer}
      </SafeAreaView>
    );
  }

  // ── Sign mode (member, pending) ──────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {Document}
        <Text style={[typography.caption, { paddingHorizontal: spacing.md }]}>
          Please read the full agreement above (tap to open it full screen). When you’re ready, sign below.
        </Text>
      </ScrollView>
      <View style={styles.signArea}>
        <TouchableOpacity style={styles.agreeRow} onPress={() => setAgreed((v) => !v)} activeOpacity={0.7}>
          <View style={[styles.checkbox, agreed ? styles.checkboxOn : null]}>{agreed ? <Text style={styles.checkmark}>✓</Text> : null}</View>
          <Text style={[typography.caption, { flex: 1 }]}>I have read and agree to this membership agreement.</Text>
        </TouchableOpacity>
        <Text style={styles.label}>Your full legal name</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="First and last name" placeholderTextColor={colors.textMuted} autoCapitalize="words" />
        <Text style={styles.label}>Signature</Text>
        <SignaturePad height={150} onChange={setPaths} />
        <Button title={busy ? 'Signing…' : 'Sign agreement'} onPress={submit} disabled={busy || !name.trim() || paths.length === 0 || !agreed} />
        <Text style={styles.fine}>Your signature is recorded with the date, time, and IP address you signed from.</Text>
      </View>
      {Viewer}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.md, paddingBottom: spacing.lg },
  doc: { width: '100%', height: 380, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, marginBottom: spacing.sm },
  signArea: { padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  label: { ...typography.caption, marginBottom: spacing.xs },
  input: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, fontSize: 16, color: colors.textPrimary, marginBottom: spacing.sm },
  fine: { ...typography.caption, color: colors.textMuted, textAlign: 'center', marginTop: spacing.sm },
  agreeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm },
  checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkmark: { color: colors.textInverse, fontWeight: '800' },
  certCard: { borderWidth: 1, borderColor: colors.border },
  certMeta: { marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: spacing.sm },
  certLabel: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },
  certValue: { ...typography.body, fontWeight: '600' },
  viewerScreen: { flex: 1, backgroundColor: '#111' },
  viewerBar: { flexDirection: 'row', alignItems: 'center', padding: spacing.md },
  viewerTitle: { ...typography.body, color: '#fff', flex: 1, fontWeight: '600' },
  viewerClose: { color: colors.primaryLight, fontWeight: '700', fontSize: 16 },
  viewerContent: { flexGrow: 1, justifyContent: 'center' },
  viewerImage: { width: '100%', height: 600 },
  viewerHint: { color: '#aaa', textAlign: 'center', fontSize: 12, paddingVertical: spacing.sm },
  fieldCanvas: { position: 'relative', backgroundColor: colors.surfaceAlt, borderRadius: radius.md, overflow: 'hidden', marginBottom: spacing.sm },
  fieldImg: { width: '100%', height: 460 },
  fBox: { position: 'absolute', borderWidth: 2, borderColor: colors.primary, borderStyle: 'dashed', backgroundColor: 'rgba(62,142,126,0.16)', borderRadius: 4, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  fBoxFilled: { backgroundColor: 'rgba(95,168,119,0.22)', borderStyle: 'solid', borderColor: colors.success },
  fBoxInner: { fontSize: 11, fontWeight: '700', color: colors.primaryDark },
  viewerContent2: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: spacing.lg },
  fieldModal: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md },
});
