import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Modal, Alert, ScrollView, ActivityIndicator, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Screen, ScreenTitle, Card, SectionTitle, Button, Pill } from '../components/ui';
import { colors, spacing, radius, typography } from '../theme';
import {
  listFormTemplates, createFormTemplate, deleteFormTemplate, assignForm, listOrgFormResponses,
  listFacilitatorIndividuals, getMyOrg, createAgreement,
  FormField, FormFieldType, FormTemplate, FormResponse, PlacedField,
} from '../services/db';
import { DocumentFieldEditor } from '../components/DocumentFieldEditor';
import { BUILT_IN_TEMPLATES, FIELD_TYPE_LABELS } from '../content/formTemplates';
import { HOUSE_FORMS } from '../content/houseForms';
import { formatDateTime } from '../utils/format';

// The field types offered in the builder (in a sensible order).
const BUILDER_TYPES: FormFieldType[] = ['text', 'longtext', 'number', 'phone', 'date', 'yesno', 'signature', 'initial', 'heading', 'paragraph'];

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || `field_${Math.floor(Date.now() % 100000)}`;
}

interface Resident { id: string; first_name?: string; last_name?: string }

export function FacilitatorFormsScreen() {
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [responses, setResponses] = useState<FormResponse[]>([]);
  const [residents, setResidents] = useState<Resident[]>([]);
  const [orgId, setOrgId] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  // Builder modal
  const [builderOpen, setBuilderOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [fields, setFields] = useState<FormField[]>([]);
  const [fLabel, setFLabel] = useState('');
  const [fType, setFType] = useState<FormFieldType>('text');
  const [busy, setBusy] = useState(false);

  // Send modal
  const [sendForm, setSendForm] = useState<{ title: string; fields: FormField[]; templateId?: string } | null>(null);
  // Upload-document modal
  const [uploadOpen, setUploadOpen] = useState(false);
  const [docTitle, setDocTitle] = useState('');
  const [pendingDoc, setPendingDoc] = useState<string | null>(null);
  const [docFields, setDocFields] = useState<PlacedField[]>([]);
  // shared recipient selection
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const load = () => {
    setLoading(true);
    Promise.all([
      listFormTemplates().then(setTemplates).catch(() => {}),
      listOrgFormResponses().then(setResponses).catch(() => {}),
      listFacilitatorIndividuals().then((r: any) => setResidents(r ?? [])).catch(() => {}),
      getMyOrg().then((o: any) => setOrgId(o?.id)).catch(() => {}),
    ]).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const nameOf = (id?: string) => {
    const r = residents.find((x) => x.id === id);
    return r ? `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim() || 'Resident' : '—';
  };

  // Built-in starter forms (operator + intake) shown alongside saved templates.
  const starters = useMemo(
    () => [
      ...HOUSE_FORMS.map((f) => ({ title: f.title, fields: f.fields })),
      ...BUILT_IN_TEMPLATES.map((t) => ({ title: t.title, fields: t.fields })),
    ],
    [],
  );

  // ── Builder ────────────────────────────────────────────────────────────────
  const addField = () => {
    const isBlock = fType === 'heading' || fType === 'paragraph';
    if (!fLabel.trim()) { Alert.alert('Add a label', isBlock ? 'Type the heading/paragraph text.' : 'Name this field.'); return; }
    setFields((prev) => [...prev, { key: slugify(fLabel) + '_' + prev.length, label: fLabel.trim(), type: fType, required: !isBlock && fType !== 'signature' ? false : undefined }]);
    setFLabel('');
  };
  const removeField = (i: number) => setFields((prev) => prev.filter((_, idx) => idx !== i));

  const saveAndSend = async () => {
    if (!title.trim()) { Alert.alert('Name the form', 'Give your form a title.'); return; }
    if (!fields.length) { Alert.alert('Add fields', 'Add at least one field or signature space.'); return; }
    setBusy(true);
    try {
      await createFormTemplate({ title: title.trim(), fields });
      setBuilderOpen(false);
      // Offer to send right away.
      setSendForm({ title: title.trim(), fields });
      setTitle(''); setFields([]);
      load();
    } catch (e: any) { Alert.alert('Could not save', e?.message ?? 'Try again.'); }
    finally { setBusy(false); }
  };

  // ── Upload a document ────────────────────────────────────────────────────────
  const pickDoc = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission needed', 'Allow photo access to upload a document.'); return; }
    const r = await ImagePicker.launchImageLibraryAsync({ quality: 0.4, base64: true, allowsEditing: false });
    if (r.canceled || !r.assets?.[0]?.base64) return;
    setPendingDoc(`data:image/jpeg;base64,${r.assets[0].base64}`);
  };

  // ── Send (assign form, or send uploaded doc as a signable agreement) ─────────
  const recipientIds = () => Object.keys(selected).filter((k) => selected[k]);

  const confirmSendForm = async () => {
    const ids = recipientIds();
    if (!sendForm || !ids.length) { Alert.alert('Pick residents', 'Select at least one resident to send to.'); return; }
    setBusy(true);
    try {
      for (const id of ids) {
        await assignForm({ individualId: id, orgId, templateId: sendForm.templateId, title: sendForm.title, fields: sendForm.fields });
      }
      setSendForm(null); setSelected({});
      Alert.alert('Sent ✅', `“${sendForm.title}” was sent to ${ids.length} resident${ids.length > 1 ? 's' : ''} to review and sign.`);
      load();
    } catch (e: any) { Alert.alert('Could not send', e?.message ?? 'Try again.'); }
    finally { setBusy(false); }
  };

  const confirmSendDoc = async () => {
    const ids = recipientIds();
    if (!docTitle.trim()) { Alert.alert('Name the document', 'Give the document a title.'); return; }
    if (!pendingDoc) { Alert.alert('Add a file', 'Upload a photo/scan of the document first.'); return; }
    if (!ids.length) { Alert.alert('Pick residents', 'Select at least one resident.'); return; }
    setBusy(true);
    try {
      for (const id of ids) {
        await createAgreement({ orgId, individualId: id, title: docTitle.trim(), documentData: pendingDoc, fields: docFields });
      }
      setUploadOpen(false); setDocTitle(''); setPendingDoc(null); setDocFields([]); setSelected({});
      Alert.alert('Sent ✅', `“${docTitle.trim()}” was sent to ${ids.length} resident${ids.length > 1 ? 's' : ''} to sign.`);
      load();
    } catch (e: any) { Alert.alert('Could not send', e?.message ?? 'Try again.'); }
    finally { setBusy(false); }
  };

  const RecipientPicker = () => (
    <View style={{ maxHeight: 240, marginVertical: spacing.sm }}>
      <Text style={[typography.caption, { marginBottom: spacing.xs }]}>Send to</Text>
      <ScrollView style={styles.pickerBox}>
        {residents.length === 0 ? (
          <Text style={[typography.caption, { padding: spacing.sm }]}>No residents yet.</Text>
        ) : residents.map((r) => {
          const on = !!selected[r.id];
          return (
            <TouchableOpacity key={r.id} style={styles.recipRow} onPress={() => setSelected((s) => ({ ...s, [r.id]: !on }))}>
              <View style={[styles.check, on && styles.checkOn]}>{on ? <Text style={styles.checkMark}>✓</Text> : null}</View>
              <Text style={typography.body}>{`${r.first_name ?? ''} ${r.last_name ?? ''}`.trim() || 'Resident'}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );

  return (
    <Screen>
      <ScreenTitle title="Forms" subtitle="Build forms, collect signatures, and send documents to residents." />

      <View style={styles.actionRow}>
        <View style={{ flex: 1, marginRight: spacing.sm }}>
          <Button title="➕ New form" onPress={() => { setTitle(''); setFields([]); setBuilderOpen(true); }} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title="⬆️ Upload document" variant="secondary" onPress={() => { setDocTitle(''); setPendingDoc(null); setDocFields([]); setSelected({}); setUploadOpen(true); }} />
        </View>
      </View>

      {loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.lg }} /> : null}

      {/* Saved templates */}
      {templates.length > 0 ? (
        <>
          <SectionTitle>Your forms</SectionTitle>
          {templates.map((t) => (
            <Card key={t.id} style={styles.rowCard}>
              <View style={{ flex: 1 }}>
                <Text style={[typography.body, { fontWeight: '700' }]}>{t.title}</Text>
                <Text style={typography.caption}>{t.fields.length} field{t.fields.length === 1 ? '' : 's'}</Text>
              </View>
              <TouchableOpacity onPress={() => { setSelected({}); setSendForm({ title: t.title, fields: t.fields, templateId: t.id }); }}>
                <Pill label="Send" color={colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => Alert.alert('Delete form?', t.title, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => { await deleteFormTemplate(t.id).catch(() => {}); load(); } }])} style={{ marginLeft: spacing.sm }}>
                <Text style={{ color: colors.textMuted, fontSize: 18 }}>🗑</Text>
              </TouchableOpacity>
            </Card>
          ))}
        </>
      ) : null}

      {/* Starter templates */}
      <SectionTitle>Starter templates</SectionTitle>
      {starters.map((s, i) => (
        <Card key={`starter_${i}`} style={styles.rowCard}>
          <View style={{ flex: 1 }}>
            <Text style={[typography.body, { fontWeight: '700' }]}>{s.title}</Text>
            <Text style={typography.caption}>{s.fields.length} field{s.fields.length === 1 ? '' : 's'}</Text>
          </View>
          <TouchableOpacity onPress={() => { setSelected({}); setSendForm({ title: s.title, fields: s.fields }); }}>
            <Pill label="Send" color={colors.primary} />
          </TouchableOpacity>
        </Card>
      ))}

      {/* Submissions */}
      <SectionTitle>Submissions</SectionTitle>
      {responses.length === 0 ? (
        <Card><Text style={typography.caption}>No submissions yet. Send a form to get started.</Text></Card>
      ) : responses.slice(0, 40).map((r) => (
        <Card key={r.id} style={styles.rowCard}>
          <View style={{ flex: 1 }}>
            <Text style={[typography.body, { fontWeight: '700' }]}>{r.title}</Text>
            <Text style={typography.caption}>{nameOf(r.individualId)} · {formatDateTime(r.createdAt)}</Text>
          </View>
          <Pill label={r.status === 'completed' ? 'Signed' : 'Pending'} color={r.status === 'completed' ? colors.success : colors.warning} />
        </Card>
      ))}
      <View style={{ height: spacing.xl }} />

      {/* ── New form builder modal ───────────────────────────────────────────── */}
      <Modal visible={builderOpen} transparent animationType="slide" onRequestClose={() => setBuilderOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.modal}>
            <ScrollView>
              <Text style={typography.h3}>New form</Text>
              <Text style={[typography.caption, { marginBottom: spacing.sm }]}>Name your form, then add fields and signature spaces.</Text>
              <Text style={styles.lbl}>Form title</Text>
              <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="e.g. House Agreement 2026" placeholderTextColor={colors.textMuted} />

              <Text style={[styles.lbl, { marginTop: spacing.md }]}>Fields</Text>
              {fields.map((f, i) => (
                <View key={f.key} style={styles.fieldRow}>
                  <Text style={{ flex: 1 }}>{f.label} <Text style={typography.caption}>({FIELD_TYPE_LABELS[f.type]})</Text></Text>
                  <TouchableOpacity onPress={() => removeField(i)}><Text style={{ color: colors.crisis }}>Remove</Text></TouchableOpacity>
                </View>
              ))}

              <View style={styles.addField}>
                <TextInput style={[styles.input, { marginBottom: spacing.sm }]} value={fLabel} onChangeText={setFLabel} placeholder="Field label (e.g. Resident signature)" placeholderTextColor={colors.textMuted} />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.sm }}>
                  {BUILDER_TYPES.map((t) => (
                    <TouchableOpacity key={t} onPress={() => setFType(t)} style={[styles.typeChip, fType === t && styles.typeChipOn]}>
                      <Text style={[styles.typeChipText, fType === t && { color: colors.textInverse }]}>{FIELD_TYPE_LABELS[t]}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <Button title="＋ Add field" variant="secondary" onPress={addField} />
              </View>

              <View style={{ height: spacing.md }} />
              <Button title={busy ? 'Saving…' : 'Save & choose recipients'} onPress={saveAndSend} disabled={busy} />
              <TouchableOpacity onPress={() => setBuilderOpen(false)} style={styles.cancel}><Text style={{ color: colors.textSecondary }}>Cancel</Text></TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Send form modal ──────────────────────────────────────────────────── */}
      <Modal visible={!!sendForm} transparent animationType="slide" onRequestClose={() => setSendForm(null)}>
        <View style={styles.backdrop}>
          <View style={styles.modal}>
            <Text style={typography.h3}>Send “{sendForm?.title}”</Text>
            <RecipientPicker />
            <Button title={busy ? 'Sending…' : 'Send to residents'} onPress={confirmSendForm} disabled={busy} />
            <TouchableOpacity onPress={() => setSendForm(null)} style={styles.cancel}><Text style={{ color: colors.textSecondary }}>Cancel</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Upload document modal ────────────────────────────────────────────── */}
      <Modal visible={uploadOpen} transparent animationType="slide" onRequestClose={() => setUploadOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.modal}>
            <ScrollView>
              <Text style={typography.h3}>Upload a document</Text>
              <Text style={[typography.caption, { marginBottom: spacing.sm }]}>Upload a photo or scan, place signature fields on it, then send it to residents to sign.</Text>
              <Text style={styles.lbl}>Document name</Text>
              <TextInput style={styles.input} value={docTitle} onChangeText={setDocTitle} placeholder="e.g. Guest Agreement" placeholderTextColor={colors.textMuted} />
              <View style={{ height: spacing.sm }} />
              <Button title={pendingDoc ? '✅ File attached — choose another' : '📎 Choose photo / scan'} variant="secondary" onPress={pickDoc} />

              {pendingDoc ? (
                <View style={{ marginTop: spacing.md }}>
                  <Text style={[styles.lbl, { marginBottom: spacing.xs }]}>Place signature fields</Text>
                  <DocumentFieldEditor imageUri={pendingDoc} fields={docFields} onChange={setDocFields} />
                </View>
              ) : null}

              <RecipientPicker />
              <Button title={busy ? 'Sending…' : 'Send to residents'} onPress={confirmSendDoc} disabled={busy} />
              <TouchableOpacity onPress={() => setUploadOpen(false)} style={styles.cancel}><Text style={{ color: colors.textSecondary }}>Cancel</Text></TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actionRow: { flexDirection: 'row', marginBottom: spacing.sm },
  rowCard: { flexDirection: 'row', alignItems: 'center' },
  lbl: { ...typography.bodySecondary, fontWeight: '600', marginBottom: spacing.xs },
  input: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, fontSize: 15, color: colors.textPrimary },
  fieldRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  addField: { marginTop: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.sm, borderWidth: 1, borderColor: colors.border },
  typeChip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, marginRight: spacing.xs, borderWidth: 1, borderColor: colors.border },
  typeChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  typeChipText: { fontWeight: '600', color: colors.textSecondary, fontSize: 13 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: spacing.lg },
  modal: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, maxHeight: '88%' },
  pickerBox: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  recipRow: { flexDirection: 'row', alignItems: 'center', padding: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  check: { width: 22, height: 22, borderRadius: 6, borderWidth: 1, borderColor: colors.border, marginRight: spacing.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  checkOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkMark: { color: colors.textInverse, fontWeight: '800', fontSize: 14 },
  cancel: { alignItems: 'center', paddingVertical: spacing.sm, marginTop: spacing.xs },
});
