import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Modal, Alert, ScrollView, Switch } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Card, SectionTitle, Button, Pill } from './ui';
import { colors, spacing, radius, typography } from '../theme';
import {
  listFormResponses, assignForm, deleteFormResponse, listFormTemplates, createFormTemplate,
  FormResponse, FormField, FormFieldType, FormTemplate,
} from '../services/db';
import { BUILT_IN_TEMPLATES, FIELD_TYPE_LABELS } from '../content/formTemplates';
import { formatDate } from '../utils/format';

const TYPE_ORDER: FormFieldType[] = ['text', 'longtext', 'phone', 'address', 'date', 'yesno', 'number', 'ssn_last4'];
function slugify(s: string) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || `field_${Math.floor(Date.now() % 100000)}`; }

/** Staff: assign lease/intake forms to a resident (built-in, saved, or custom),
 *  and review what they've signed. */
export function FormsManager({ individualId, orgId, memberName }: { individualId: string; orgId?: string; memberName?: string }) {
  const nav = useNavigation<any>();
  const [responses, setResponses] = useState<FormResponse[]>([]);
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);

  // custom builder state
  const [title, setTitle] = useState('');
  const [fields, setFields] = useState<FormField[]>([]);
  const [fLabel, setFLabel] = useState('');
  const [fType, setFType] = useState<FormFieldType>('text');
  const [fRequired, setFRequired] = useState(false);
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = () => {
    listFormResponses(individualId).then(setResponses).catch(() => {});
    listFormTemplates().then(setTemplates).catch(() => {});
  };
  useEffect(() => { load(); }, [individualId]);

  const assign = async (t: { title: string; fields: FormField[]; templateId?: string }) => {
    setBusy(true);
    try {
      await assignForm({ individualId, orgId, templateId: t.templateId, title: t.title, fields: t.fields });
      setPickerOpen(false);
      load();
      Alert.alert('Form sent ✅', `${memberName || 'The resident'} will see “${t.title}” to complete and sign.`);
    } catch (e: any) { Alert.alert('Could not assign', e?.message ?? 'Try again.'); }
    finally { setBusy(false); }
  };

  const addField = () => {
    if (!fLabel.trim()) return;
    setFields((arr) => [...arr, { key: slugify(fLabel) + '_' + arr.length, label: fLabel.trim(), type: fType, required: fRequired }]);
    setFLabel(''); setFType('text'); setFRequired(false);
  };

  const saveCustom = async () => {
    if (!title.trim() || fields.length === 0) { Alert.alert('Add a title and at least one question'); return; }
    setBusy(true);
    try {
      if (saveAsTemplate) await createFormTemplate({ title: title.trim(), fields }).catch(() => {});
      await assignForm({ individualId, orgId, title: title.trim(), fields });
      setBuilderOpen(false); setTitle(''); setFields([]); setSaveAsTemplate(false);
      load();
      Alert.alert('Form sent ✅', `${memberName || 'The resident'} will see “${title.trim()}” to complete and sign.`);
    } catch (e: any) { Alert.alert('Could not assign', e?.message ?? 'Try again.'); }
    finally { setBusy(false); }
  };

  const remove = (r: FormResponse) => {
    Alert.alert('Delete form?', `Remove “${r.title}”?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await deleteFormResponse(r.id).catch(() => {}); load(); } },
    ]);
  };

  return (
    <>
      <SectionTitle>Lease &amp; Intake Form Templates/Custom</SectionTitle>
      <Card>
        <Text style={[typography.caption, { marginBottom: spacing.sm }]}>
          Send {memberName || 'this resident'} a form to fill in and e-sign (lease, intake, emergency contact, etc.).
        </Text>

        {responses.length === 0 ? (
          <Text style={typography.bodySecondary}>No forms sent yet.</Text>
        ) : (
          responses.map((r) => (
            <TouchableOpacity key={r.id} style={styles.row} onPress={() => nav.navigate('FormFill', { id: r.id })} onLongPress={() => remove(r)}>
              <Text style={styles.icon}>📋</Text>
              <View style={{ flex: 1 }}>
                <Text style={typography.body}>{r.title}</Text>
                <Text style={typography.caption}>{r.status === 'completed' ? `Signed ${r.signedAt ? formatDate(r.signedAt) : ''}` : `Sent ${formatDate(r.createdAt)}`}</Text>
              </View>
              <Pill label={r.status === 'completed' ? 'Signed' : 'Pending'} color={r.status === 'completed' ? colors.success : colors.warning} />
            </TouchableOpacity>
          ))
        )}

        <View style={{ height: spacing.sm }} />
        <Button title="➕ Send a form" variant="secondary" onPress={() => setPickerOpen(true)} />
        {responses.length ? <Text style={[typography.caption, { color: colors.textMuted, marginTop: 4 }]}>Tap a form to view it · long-press to delete.</Text> : null}
      </Card>

      {/* Picker: built-in + saved templates + custom */}
      <Modal visible={pickerOpen} transparent animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={typography.h3}>Choose a form</Text>
            <ScrollView style={{ maxHeight: 380, marginVertical: spacing.sm }}>
              <Text style={styles.group}>Ready-made</Text>
              {BUILT_IN_TEMPLATES.map((t) => (
                <TouchableOpacity key={t.key} style={styles.tmpl} disabled={busy} onPress={() => assign({ title: t.title, fields: t.fields })}>
                  <Text style={typography.body}>{t.title}</Text>
                  <Text style={typography.caption}>{t.description}</Text>
                </TouchableOpacity>
              ))}
              {templates.length ? <Text style={styles.group}>Your saved forms</Text> : null}
              {templates.map((t) => (
                <TouchableOpacity key={t.id} style={styles.tmpl} disabled={busy} onPress={() => assign({ title: t.title, fields: t.fields, templateId: t.id })}>
                  <Text style={typography.body}>{t.title}</Text>
                  <Text style={typography.caption}>{t.fields.length} question{t.fields.length === 1 ? '' : 's'}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <Button title="✏️ Build a custom form" onPress={() => { setPickerOpen(false); setBuilderOpen(true); }} />
            <TouchableOpacity onPress={() => setPickerOpen(false)} style={styles.cancel}><Text style={{ color: colors.textSecondary }}>Cancel</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Custom builder */}
      <Modal visible={builderOpen} transparent animationType="slide" onRequestClose={() => setBuilderOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={typography.h3}>Build a form</Text>
            <ScrollView style={{ maxHeight: 440 }}>
              <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Form title (e.g. House Lease Agreement)" placeholderTextColor={colors.textMuted} />

              {fields.map((f, i) => (
                <View key={f.key} style={styles.fieldRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={typography.body}>{f.label}{f.required ? ' *' : ''}</Text>
                    <Text style={typography.caption}>{FIELD_TYPE_LABELS[f.type]}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setFields((arr) => arr.filter((_, j) => j !== i))}><Text style={{ color: colors.crisis }}>Remove</Text></TouchableOpacity>
                </View>
              ))}

              <Text style={[styles.group, { marginTop: spacing.sm }]}>Add a question</Text>
              <TextInput style={styles.input} value={fLabel} onChangeText={setFLabel} placeholder="Question / label (e.g. Last 4 of SSN)" placeholderTextColor={colors.textMuted} />
              <View style={styles.typeChips}>
                {TYPE_ORDER.map((t) => (
                  <TouchableOpacity key={t} style={[styles.typeChip, fType === t && styles.typeChipOn]} onPress={() => setFType(t)}>
                    <Text style={[styles.typeChipText, fType === t && { color: colors.textInverse }]}>{FIELD_TYPE_LABELS[t]}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.reqRow}>
                <Text style={typography.body}>Required</Text>
                <Switch value={fRequired} onValueChange={setFRequired} trackColor={{ true: colors.primary }} />
              </View>
              <Button title="＋ Add question" variant="secondary" onPress={addField} disabled={!fLabel.trim()} />

              <View style={styles.reqRow}>
                <Text style={typography.body}>Save as a reusable template</Text>
                <Switch value={saveAsTemplate} onValueChange={setSaveAsTemplate} trackColor={{ true: colors.primary }} />
              </View>
            </ScrollView>
            <View style={{ height: spacing.sm }} />
            <Button title={busy ? 'Sending…' : 'Send to resident'} onPress={saveCustom} disabled={busy || !title.trim() || fields.length === 0} />
            <TouchableOpacity onPress={() => setBuilderOpen(false)} style={styles.cancel}><Text style={{ color: colors.textSecondary }}>Cancel</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider },
  icon: { fontSize: 20, marginRight: spacing.sm },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, paddingBottom: spacing.xl },
  group: { ...typography.caption, fontWeight: '800', color: colors.textMuted, textTransform: 'uppercase', marginTop: spacing.sm, marginBottom: spacing.xs },
  tmpl: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  input: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, fontSize: 15, color: colors.textPrimary, marginBottom: spacing.sm },
  fieldRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.divider },
  typeChips: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.xs },
  typeChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, marginRight: spacing.sm, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
  typeChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  typeChipText: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  reqRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: spacing.sm },
  cancel: { alignItems: 'center', paddingVertical: spacing.sm },
});
