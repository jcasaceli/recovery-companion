import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Modal, Alert, ScrollView, ActivityIndicator, Platform, useWindowDimensions } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Screen, ScreenTitle, Card, SectionTitle, Button, Pill } from '../components/ui';
import { colors, spacing, radius, typography } from '../theme';
import {
  listFormTemplates, createFormTemplate, deleteFormTemplate, assignForm, listOrgFormResponses,
  listFacilitatorIndividuals, getMyOrg, createAgreement,
  FormField, FormFieldType, FormTemplate, FormResponse, PlacedField,
} from '../services/db';
import { DocumentFieldEditor } from '../components/DocumentFieldEditor';
import { RichTextEditor } from '../components/RichTextEditor';
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
  const { width } = useWindowDimensions();
  const wide = Platform.OS === 'web' && width >= 900; // CRM table only on the desktop site
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
  // Write-agreement (rich text) modal
  const [writeOpen, setWriteOpen] = useState(false);
  const [agrTitle, setAgrTitle] = useState('');
  const [agrHtml, setAgrHtml] = useState('');
  // Table view (OneStep-style)
  const [tab, setTab] = useState<'forms' | 'submissions'>('forms');
  const [sortAsc, setSortAsc] = useState(true);
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

  // Built-in starter forms (operator + intake), de-duplicated by title.
  const starters = useMemo(() => {
    const seen = new Set<string>();
    const out: { title: string; fields: FormField[] }[] = [];
    for (const f of [...HOUSE_FORMS, ...BUILT_IN_TEMPLATES]) {
      const k = f.title.trim().toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ title: f.title, fields: f.fields });
    }
    return out;
  }, []);

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

  const confirmSendWritten = async () => {
    const ids = recipientIds();
    if (!agrTitle.trim()) { Alert.alert('Name the agreement', 'Give it a title.'); return; }
    if (!agrHtml.trim()) { Alert.alert('Write the agreement', 'Add the agreement text.'); return; }
    if (!ids.length) { Alert.alert('Pick residents', 'Select at least one resident.'); return; }
    setBusy(true);
    try {
      for (const id of ids) {
        await createAgreement({ orgId, individualId: id, title: agrTitle.trim(), bodyHtml: agrHtml });
      }
      setWriteOpen(false); setAgrTitle(''); setAgrHtml(''); setSelected({});
      Alert.alert('Sent ✅', `“${agrTitle.trim()}” was sent to ${ids.length} resident${ids.length > 1 ? 's' : ''} to read and sign.`);
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

  const openBuilder = () => { setTitle(''); setFields([]); setBuilderOpen(true); };
  const openWrite = () => { setAgrTitle(''); setAgrHtml(''); setSelected({}); setWriteOpen(true); };
  const openUpload = () => { setDocTitle(''); setPendingDoc(null); setDocFields([]); setSelected({}); setUploadOpen(true); };
  const countFor = (title: string) => responses.filter((r) => r.title === title).length;
  const openSend = (f: { title: string; fields: FormField[]; templateId?: string }) => { setSelected({}); setSendForm(f); };
  const del = (id: string, title: string) => Alert.alert('Delete form?', title, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => { await deleteFormTemplate(id).catch(() => {}); load(); } },
  ]);
  // Saved templates first (they win), then starters — skipping any title already
  // shown, so nothing appears twice across saved + starter lists.
  const formsList = (() => {
    const seen = new Set<string>();
    const out: { key: string; title: string; fields: FormField[]; templateId?: string; saved: boolean }[] = [];
    for (const t of templates) {
      const k = t.title.trim().toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ key: t.id, title: t.title, fields: t.fields, templateId: t.id, saved: true });
    }
    starters.forEach((s, i) => {
      const k = s.title.trim().toLowerCase();
      if (seen.has(k)) return;
      seen.add(k);
      out.push({ key: `st_${i}`, title: s.title, fields: s.fields, templateId: undefined, saved: false });
    });
    return out.sort((a, b) => (sortAsc ? a.title.localeCompare(b.title) : b.title.localeCompare(a.title)));
  })();

  const Modals = (
    <>
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

      {/* ── Write agreement (rich text) modal ────────────────────────────────── */}
      <Modal visible={writeOpen} transparent animationType="slide" onRequestClose={() => setWriteOpen(false)}>
        <View style={styles.backdrop}>
          <View style={[styles.modal, { maxWidth: 760, alignSelf: 'center', width: '100%' }]}>
            <ScrollView>
              <Text style={typography.h3}>Write an agreement</Text>
              <Text style={[typography.caption, { marginBottom: spacing.sm }]}>Format the text, or paste from Word, then send it to residents to read and sign.</Text>
              <Text style={styles.lbl}>Title</Text>
              <TextInput style={styles.input} value={agrTitle} onChangeText={setAgrTitle} placeholder="e.g. House Membership Agreement" placeholderTextColor={colors.textMuted} />
              <View style={{ height: spacing.sm }} />
              <RichTextEditor valueHtml={agrHtml} onChangeHtml={setAgrHtml} placeholder="Type or paste your agreement here…" />
              <RecipientPicker />
              <Button title={busy ? 'Sending…' : 'Send to residents'} onPress={confirmSendWritten} disabled={busy} />
              <TouchableOpacity onPress={() => setWriteOpen(false)} style={styles.cancel}><Text style={{ color: colors.textSecondary }}>Cancel</Text></TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );

  // Phone / narrow: keep the simple, touch-friendly card layout (app stays as-is).
  if (!wide) {
    return (
      <Screen>
        <ScreenTitle title="Forms" subtitle="Build forms, collect signatures, and send documents to residents." />
        <View style={{ marginBottom: spacing.sm }}>
          <Button title="✍️ Write agreement" onPress={openWrite} />
          <View style={{ height: spacing.sm }} />
          <Button title="➕ New form" variant="secondary" onPress={openBuilder} />
          <View style={{ height: spacing.sm }} />
          <Button title="⬆️ Upload document" variant="secondary" onPress={openUpload} />
        </View>

        {loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.lg }} /> : null}

        <SectionTitle>Your forms</SectionTitle>
        {formsList.map((f) => (
          <Card key={f.key} style={styles.rowCard}>
            <View style={{ flex: 1 }}>
              <Text style={[typography.body, { fontWeight: '700' }]}>{f.title}</Text>
              <Text style={typography.caption}>{f.fields.length} field{f.fields.length === 1 ? '' : 's'}{f.saved ? '' : ' · starter'}</Text>
            </View>
            <TouchableOpacity onPress={() => openSend(f)}><Pill label="Send" color={colors.primary} /></TouchableOpacity>
            {f.saved ? (
              <TouchableOpacity onPress={() => del(f.templateId!, f.title)} style={{ marginLeft: spacing.sm }}>
                <Text style={{ color: colors.textMuted, fontSize: 18 }}>🗑</Text>
              </TouchableOpacity>
            ) : null}
          </Card>
        ))}

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
        {Modals}
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.headerRow}>
        <Text style={styles.pageTitle}>Forms</Text>
        <TouchableOpacity style={styles.newBtn} onPress={openBuilder}><Text style={styles.newBtnText}>＋ New form</Text></TouchableOpacity>
      </View>
      <View style={styles.subActions}>
        <TouchableOpacity onPress={openWrite}><Text style={styles.subAction}>✍️ Write agreement</Text></TouchableOpacity>
        <TouchableOpacity onPress={openUpload}><Text style={styles.subAction}>⬆️ Upload document</Text></TouchableOpacity>
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity style={[styles.tabBtn, tab === 'forms' && styles.tabBtnActive]} onPress={() => setTab('forms')}>
          <Text style={[styles.tabText, tab === 'forms' && styles.tabTextActive]}>Forms</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabBtn, tab === 'submissions' && styles.tabBtnActive]} onPress={() => setTab('submissions')}>
          <Text style={[styles.tabText, tab === 'submissions' && styles.tabTextActive]}>Submissions</Text>
          <View style={styles.badge}><Text style={styles.badgeText}>{responses.length}</Text></View>
        </TouchableOpacity>
      </View>

      {loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.lg }} /> : null}

      {tab === 'forms' ? (
        <Card style={{ padding: 0 }}>
          <View style={styles.thead}>
            <TouchableOpacity style={styles.colTitle} onPress={() => setSortAsc((a) => !a)}>
              <Text style={styles.th}>TITLE {sortAsc ? '▲' : '▼'}</Text>
            </TouchableOpacity>
            <Text style={[styles.th, styles.colType]}>FIELDS</Text>
            <Text style={[styles.th, styles.colRight]}>SUBMISSIONS</Text>
          </View>
          {formsList.map((f) => (
            <View key={f.key} style={styles.tr}>
              <View style={styles.colTitle}>
                <Text style={styles.cellTitle}>{f.title}</Text>
                {f.saved
                  ? <TouchableOpacity onPress={() => del(f.templateId!, f.title)}><Text style={styles.delLink}>Delete</Text></TouchableOpacity>
                  : <Text style={styles.starterTag}>Starter template</Text>}
              </View>
              <Text style={[styles.cell, styles.colType]}>{f.fields.length}</Text>
              <View style={[styles.colRight, styles.rightCell]}>
                <TouchableOpacity onPress={() => setTab('submissions')}><Text style={styles.link}>{countFor(f.title)} ›</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => openSend(f)} style={{ marginLeft: spacing.md }}><Pill label="Send" color={colors.primary} /></TouchableOpacity>
              </View>
            </View>
          ))}
        </Card>
      ) : (
        <Card style={{ padding: 0 }}>
          <View style={styles.thead}>
            <Text style={[styles.th, styles.colTitle]}>NAME</Text>
            <Text style={[styles.th, styles.colType]}>FORM</Text>
            <Text style={[styles.th, styles.colRight]}>STATUS</Text>
          </View>
          {responses.length === 0 ? (
            <View style={styles.tr}><Text style={typography.caption}>No submissions yet. Send a form to get started.</Text></View>
          ) : responses.slice(0, 100).map((r) => (
            <View key={r.id} style={styles.tr}>
              <View style={styles.colTitle}>
                <Text style={styles.cellTitle}>{nameOf(r.individualId)}</Text>
                <Text style={typography.caption}>{formatDateTime(r.createdAt)}</Text>
              </View>
              <Text style={[styles.cell, styles.colType]} numberOfLines={1}>{r.title}</Text>
              <View style={[styles.colRight, styles.rightCell]}>
                <Pill label={r.status === 'completed' ? 'Signed' : 'Pending'} color={r.status === 'completed' ? colors.success : colors.warning} />
              </View>
            </View>
          ))}
        </Card>
      )}
      <View style={{ height: spacing.xl }} />
      {Modals}
    </Screen>
  );
}

const styles = StyleSheet.create({
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.sm },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs },
  pageTitle: { fontSize: 26, fontWeight: '800', color: colors.textPrimary },
  newBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 16 },
  newBtnText: { color: colors.textInverse, fontWeight: '800', fontSize: 15 },
  subActions: { flexDirection: 'row', gap: spacing.lg, marginBottom: spacing.md },
  subAction: { color: colors.primaryDark, fontWeight: '700', fontSize: 14 },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: spacing.md },
  tabBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, paddingHorizontal: spacing.xs, marginRight: spacing.lg, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabBtnActive: { borderBottomColor: colors.primary },
  tabText: { fontSize: 15, fontWeight: '700', color: colors.textSecondary },
  tabTextActive: { color: colors.textPrimary },
  badge: { backgroundColor: colors.surfaceAlt, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 1, marginLeft: 6 },
  badgeText: { fontSize: 12, fontWeight: '800', color: colors.textSecondary },
  thead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surfaceAlt },
  th: { fontSize: 12, fontWeight: '800', color: colors.textMuted, letterSpacing: 0.4 },
  tr: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  colTitle: { flex: 2, paddingRight: spacing.sm },
  colType: { flex: 1, textAlign: 'center' },
  colRight: { flex: 1.4 },
  rightCell: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
  cell: { ...typography.body, color: colors.textSecondary },
  cellTitle: { ...typography.body, fontWeight: '700', color: colors.textPrimary },
  delLink: { color: colors.crisis, fontSize: 12, marginTop: 2 },
  starterTag: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  link: { color: colors.primary, fontWeight: '700' },
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
