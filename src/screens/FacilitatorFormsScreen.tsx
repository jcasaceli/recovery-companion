import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Modal, Alert, ScrollView, ActivityIndicator, Platform, useWindowDimensions } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Screen, ScreenTitle, Card, SectionTitle, Button, Pill } from '../components/ui';
import { colors, spacing, radius, typography } from '../theme';
import {
  listFormTemplates, createFormTemplate, updateFormTemplate, deleteFormTemplate, assignForm, listOrgFormResponses,
  listFacilitatorIndividuals, getMyOrg, createAgreement, listOrgAgreements,
  FormField, FormFieldType, FormTemplate, FormResponse, PlacedField,
} from '../services/db';
import { DocumentFieldEditor } from '../components/DocumentFieldEditor';
import { RichTextEditor } from '../components/RichTextEditor';
import { pdfToImage } from '../utils/pdf';
import { BUILT_IN_TEMPLATES, FIELD_TYPE_LABELS } from '../content/formTemplates';
import { HOUSE_FORMS } from '../content/houseForms';
import { formatDateTime } from '../utils/format';

// The field types offered in the builder (in a sensible order).
const BUILDER_TYPES: FormFieldType[] = ['text', 'longtext', 'number', 'phone', 'date', 'yesno', 'signature', 'initial', 'heading', 'paragraph'];

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || `field_${Math.floor(Date.now() % 100000)}`;
}

// Map a structured field type to an inline rich-text field token so a field-based
// form can be edited in the Word-style editor.
const FIELD_TO_SL: Record<string, string> = {
  text: 'text', longtext: 'text', ssn_last4: 'text', address: 'text',
  number: 'number', phone: 'phone', date: 'date', yesno: 'checkbox',
  signature: 'signature', initial: 'initials',
};
const SL_LABEL: Record<string, string> = {
  signature: '✍️ Signature', initials: '🅰️ Initials', date: '📅 Date',
  number: '🔢 Number', phone: '📞 Phone', email: '✉️ Email', checkbox: '☑️ Checkbox', text: '🔤 Text',
};
function esc(s: string) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function slToken(type: string) {
  const key = `f_${type}_${Math.random().toString(36).slice(2, 8)}`;
  const style = 'display:inline-block;background:#FCE8A6;border:1px solid #E0B33A;border-radius:4px;padding:0 8px;margin:0 2px;font-weight:700;color:#7a5b00;cursor:grab;';
  return `<span data-sl-field="${type}" data-sl-key="${key}" contenteditable="false" draggable="true" title="Drag to move" style="${style}">${SL_LABEL[type] || '🔤 Text'}</span>`;
}
function fieldsToHtml(fields: FormField[]): string {
  return fields.map((f) => {
    if (f.type === 'heading') return `<p><strong style="font-size:18px">${esc(f.label)}</strong></p>`;
    if (f.type === 'paragraph') return `<p>${esc(f.label)}</p>`;
    return `<p><strong>${esc(f.label)}:</strong> ${slToken(FIELD_TO_SL[f.type] || 'text')}</p>`;
  }).join('');
}

interface Resident { id: string; first_name?: string; last_name?: string }

export function FacilitatorFormsScreen() {
  const { width } = useWindowDimensions();
  const wide = Platform.OS === 'web' && width >= 900; // CRM table only on the desktop site
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [responses, setResponses] = useState<FormResponse[]>([]);
  const [agrs, setAgrs] = useState<any[]>([]);
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
  const [sendForm, setSendForm] = useState<{ title: string; fields: FormField[]; templateId?: string; bodyHtml?: string } | null>(null);
  // Upload-document modal
  const [uploadOpen, setUploadOpen] = useState(false);
  const [docTitle, setDocTitle] = useState('');
  const [pendingDoc, setPendingDoc] = useState<string | null>(null);
  const [docFields, setDocFields] = useState<PlacedField[]>([]);
  const [converting, setConverting] = useState(false);
  // Write-agreement (rich text) modal
  const [writeOpen, setWriteOpen] = useState(false);
  const [agrTitle, setAgrTitle] = useState('');
  const [agrHtml, setAgrHtml] = useState('');
  // Table view (OneStep-style)
  const [tab, setTab] = useState<'forms' | 'submissions'>('forms');
  const [sortAsc, setSortAsc] = useState(true);
  // When set, the builder/write modal is editing an existing saved template.
  const [editingId, setEditingId] = useState<string | null>(null);
  // shared recipient selection
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const load = () => {
    setLoading(true);
    Promise.all([
      listFormTemplates().then(setTemplates).catch(() => {}),
      listOrgFormResponses().then(setResponses).catch(() => {}),
      listOrgAgreements().then((a: any) => setAgrs(a ?? [])).catch(() => {}),
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
      if (editingId) {
        // Editing an existing template — save changes and close.
        await updateFormTemplate(editingId, { title: title.trim(), fields });
        setBuilderOpen(false); setEditingId(null); setTitle(''); setFields([]);
        Alert.alert('Saved ✅', 'Your form was updated.');
      } else {
        await createFormTemplate({ title: title.trim(), fields });
        setBuilderOpen(false);
        setSendForm({ title: title.trim(), fields }); // offer to send right away
        setTitle(''); setFields([]);
      }
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

  // Web: pick a PDF, render it to one tall image, then place fields on it.
  const pickPdf = () => {
    const g: any = globalThis;
    if (!g.document) { Alert.alert('PDF', 'Upload a PDF from the web app.'); return; }
    const input = g.document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf';
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return;
      const reader = new g.FileReader();
      reader.onload = async () => {
        setConverting(true);
        try {
          const img = await pdfToImage(String(reader.result || ''));
          setPendingDoc(img);
          setDocFields([]);
        } catch (e: any) { Alert.alert('Could not read PDF', e?.message ?? 'Try again.'); }
        finally { setConverting(false); }
      };
      reader.readAsDataURL(f);
    };
    input.click();
  };

  // ── Send (assign form, or send uploaded doc as a signable agreement) ─────────
  const recipientIds = () => Object.keys(selected).filter((k) => selected[k]);

  const confirmSendForm = async () => {
    const ids = recipientIds();
    if (!sendForm || !ids.length) { Alert.alert('Pick residents', 'Select at least one resident to send to.'); return; }
    setBusy(true);
    try {
      // Everything is sent as one kind of thing: a document/agreement the resident
      // reads, fills, and signs. Field-based forms are converted to rich text.
      const html = sendForm.bodyHtml || fieldsToHtml(sendForm.fields);
      for (const id of ids) {
        await createAgreement({ orgId, individualId: id, title: sendForm.title, bodyHtml: html });
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

  const openBuilder = () => { setEditingId(null); setTitle(''); setFields([]); setBuilderOpen(true); };
  const openWrite = () => { setEditingId(null); setAgrTitle(''); setAgrHtml(''); setSelected({}); setWriteOpen(true); };
  const openUpload = () => { setDocTitle(''); setPendingDoc(null); setDocFields([]); setSelected({}); setUploadOpen(true); };
  // Unified submissions: sent agreements + any legacy form responses.
  const submissions = [
    ...agrs.map((a) => ({ id: a.id, title: a.title, individualId: a.individualId, createdAt: a.createdAt, done: a.status === 'signed' })),
    ...responses.map((r) => ({ id: r.id, title: r.title, individualId: r.individualId, createdAt: r.createdAt, done: r.status === 'completed' })),
  ].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const countFor = (title: string) => submissions.filter((s) => s.title === title).length;
  const openSend = (f: { title: string; fields: FormField[]; templateId?: string; bodyHtml?: string }) => { setSelected({}); setSendForm(f); };
  const del = (id: string, title: string) => Alert.alert('Delete form?', title, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => { await deleteFormTemplate(id).catch(() => {}); load(); } },
  ]);

  // Edit a template: rich-text ones open the Word-style editor, field-based ones
  // open the field builder — both prefilled. Starters open a fresh copy to save.
  // Edit always opens the Word-style editor. Field-based forms are converted to
  // rich text (label + inline field token) so everything edits the same way.
  const openEdit = (f: { title: string; fields: FormField[]; templateId?: string; bodyHtml?: string }) => {
    setEditingId(f.templateId ?? null);
    setSelected({});
    setAgrTitle(f.title);
    setAgrHtml(f.bodyHtml || fieldsToHtml(f.fields));
    setWriteOpen(true);
  };

  // Save the written agreement as a reusable template (create or update).
  const saveWrittenTemplate = async () => {
    if (!agrTitle.trim()) { Alert.alert('Name the agreement', 'Give it a title.'); return; }
    if (!agrHtml.trim()) { Alert.alert('Write the agreement', 'Add the agreement text.'); return; }
    setBusy(true);
    try {
      if (editingId) await updateFormTemplate(editingId, { title: agrTitle.trim(), bodyHtml: agrHtml, fields: [] });
      else await createFormTemplate({ title: agrTitle.trim(), fields: [], bodyHtml: agrHtml });
      setWriteOpen(false); setEditingId(null); setAgrTitle(''); setAgrHtml('');
      Alert.alert('Saved ✅', 'Your agreement template was saved. Open it any time to edit or send.');
      load();
    } catch (e: any) { Alert.alert('Could not save', e?.message ?? 'Try again.'); }
    finally { setBusy(false); }
  };
  // Saved templates first (they win), then starters — skipping any title already
  // shown, so nothing appears twice across saved + starter lists.
  const formsList = (() => {
    const seen = new Set<string>();
    const out: { key: string; title: string; fields: FormField[]; templateId?: string; bodyHtml?: string; saved: boolean }[] = [];
    for (const t of templates) {
      const k = t.title.trim().toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ key: t.id, title: t.title, fields: t.fields, templateId: t.id, bodyHtml: t.bodyHtml, saved: true });
    }
    starters.forEach((s, i) => {
      const k = s.title.trim().toLowerCase();
      if (seen.has(k)) return;
      seen.add(k);
      out.push({ key: `st_${i}`, title: s.title, fields: s.fields, templateId: undefined, bodyHtml: undefined, saved: false });
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
              <Text style={typography.h3}>{editingId ? 'Edit form' : 'New form'}</Text>
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
              <Button title={busy ? 'Saving…' : (editingId ? '💾 Save changes' : 'Save & choose recipients')} onPress={saveAndSend} disabled={busy} />
              <TouchableOpacity onPress={() => { setBuilderOpen(false); setEditingId(null); }} style={styles.cancel}><Text style={{ color: colors.textSecondary }}>Cancel</Text></TouchableOpacity>
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
              {Platform.OS === 'web' ? (
                <>
                  <View style={{ height: spacing.sm }} />
                  <Button title={converting ? 'Converting PDF…' : '📄 Choose PDF'} variant="secondary" onPress={pickPdf} disabled={converting} />
                </>
              ) : null}

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
              <Text style={typography.h3}>{editingId ? 'Edit agreement' : 'Write an agreement'}</Text>
              <Text style={[typography.caption, { marginBottom: spacing.sm }]}>Format the text, or paste from Word. Save it as a reusable template, or send it to residents to read and sign.</Text>
              <Text style={styles.lbl}>Title</Text>
              <TextInput style={styles.input} value={agrTitle} onChangeText={setAgrTitle} placeholder="e.g. House Membership Agreement" placeholderTextColor={colors.textMuted} />
              <View style={{ height: spacing.sm }} />
              <RichTextEditor key={editingId || 'new'} valueHtml={agrHtml} onChangeHtml={setAgrHtml} placeholder="Type or paste your agreement here…" />
              <View style={{ height: spacing.sm }} />
              <Button title={busy ? 'Saving…' : (editingId ? '💾 Save changes' : '💾 Save as template')} variant="secondary" onPress={saveWrittenTemplate} disabled={busy} />
              <RecipientPicker />
              <Button title={busy ? 'Sending…' : 'Send to residents'} onPress={confirmSendWritten} disabled={busy} />
              <TouchableOpacity onPress={() => { setWriteOpen(false); setEditingId(null); }} style={styles.cancel}><Text style={{ color: colors.textSecondary }}>Cancel</Text></TouchableOpacity>
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
            <TouchableOpacity onPress={() => openEdit(f)} style={{ marginRight: spacing.sm }}><Text style={styles.link}>Edit</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => openSend(f)}><Pill label="Send" color={colors.primary} /></TouchableOpacity>
            {f.saved ? (
              <TouchableOpacity onPress={() => del(f.templateId!, f.title)} style={{ marginLeft: spacing.sm }}>
                <Text style={{ color: colors.textMuted, fontSize: 18 }}>🗑</Text>
              </TouchableOpacity>
            ) : null}
          </Card>
        ))}

        <SectionTitle>Submissions</SectionTitle>
        {submissions.length === 0 ? (
          <Card><Text style={typography.caption}>No submissions yet. Send a form to get started.</Text></Card>
        ) : submissions.slice(0, 40).map((r) => (
          <Card key={r.id} style={styles.rowCard}>
            <View style={{ flex: 1 }}>
              <Text style={[typography.body, { fontWeight: '700' }]}>{r.title}</Text>
              <Text style={typography.caption}>{nameOf(r.individualId)} · {formatDateTime(r.createdAt)}</Text>
            </View>
            <Pill label={r.done ? 'Signed' : 'Pending'} color={r.done ? colors.success : colors.warning} />
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
          <View style={styles.badge}><Text style={styles.badgeText}>{submissions.length}</Text></View>
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
                <TouchableOpacity onPress={() => openEdit(f)} style={{ marginLeft: spacing.md }}><Text style={styles.link}>Edit</Text></TouchableOpacity>
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
          {submissions.length === 0 ? (
            <View style={styles.tr}><Text style={typography.caption}>No submissions yet. Send a form to get started.</Text></View>
          ) : submissions.slice(0, 100).map((r) => (
            <View key={r.id} style={styles.tr}>
              <View style={styles.colTitle}>
                <Text style={styles.cellTitle}>{nameOf(r.individualId)}</Text>
                <Text style={typography.caption}>{formatDateTime(r.createdAt)}</Text>
              </View>
              <Text style={[styles.cell, styles.colType]} numberOfLines={1}>{r.title}</Text>
              <View style={[styles.colRight, styles.rightCell]}>
                <Pill label={r.done ? 'Signed' : 'Pending'} color={r.done ? colors.success : colors.warning} />
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
