import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Alert, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Screen, ScreenTitle, Card, Button, Pill } from '../components/ui';
import { colors, spacing, radius, typography } from '../theme';
import {
  assignHouseForm, listHouseForms, deleteFormResponse, listFormTemplates,
  getMyOrg, FormResponse, FormTemplate, FormField,
} from '../services/db';
import { BUILT_IN_TEMPLATES, HOUSE_LEVEL_FORM_KEYS } from '../content/formTemplates';
import { formatDate } from '../utils/format';

/** Staff: house-level forms not tied to a single resident (e.g. a blank Head of
 *  House Agreement). Fill in & e-sign right here. */
export function HouseFormsScreen() {
  const nav = useNavigation<any>();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [forms, setForms] = useState<FormResponse[]>([]);
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = (org?: string) => {
    const id = org ?? orgId;
    if (!id) return;
    listHouseForms(id).then(setForms).catch(() => {});
    listFormTemplates().then(setTemplates).catch(() => {});
  };
  useEffect(() => {
    getMyOrg().then((o) => { if (o?.id) { setOrgId(o.id); load(o.id); } }).catch(() => {});
  }, []);

  const add = async (t: { title: string; fields: FormField[]; templateId?: string }) => {
    if (!orgId) { Alert.alert('No house found', 'Set up your house first.'); return; }
    setBusy(true);
    try {
      await assignHouseForm({ orgId, templateId: t.templateId, title: t.title, fields: t.fields });
      setPickerOpen(false);
      load();
      Alert.alert('Form added ✅', `Open “${t.title}” below to fill it in and sign.`);
    } catch (e: any) { Alert.alert('Could not add', e?.message ?? 'Try again.'); }
    finally { setBusy(false); }
  };

  const remove = (r: FormResponse) => {
    Alert.alert('Delete form?', `Remove “${r.title}”?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await deleteFormResponse(r.id).catch(() => {}); load(); } },
    ]);
  };

  // Show the house-level forms first in the picker, then the rest.
  const suggested = BUILT_IN_TEMPLATES.filter((t) => HOUSE_LEVEL_FORM_KEYS.includes(t.key));
  const others = BUILT_IN_TEMPLATES.filter((t) => !HOUSE_LEVEL_FORM_KEYS.includes(t.key));

  return (
    <Screen edges={[]}>
      <ScreenTitle title="House forms" subtitle="Forms for the house — not tied to one resident" />

      <Card>
        <Text style={[typography.caption, { marginBottom: spacing.sm }]}>
          Blank forms you fill in and e-sign at the house level, like the Head of House Agreement.
          For forms about a specific resident, use the Forms section on that member’s profile.
        </Text>

        {forms.length === 0 ? (
          <Text style={typography.bodySecondary}>No house forms yet.</Text>
        ) : (
          forms.map((r) => (
            <TouchableOpacity key={r.id} style={styles.row} onPress={() => nav.navigate('FormFill', { id: r.id })} onLongPress={() => remove(r)}>
              <Text style={styles.icon}>📋</Text>
              <View style={{ flex: 1 }}>
                <Text style={typography.body}>{r.title}</Text>
                <Text style={typography.caption}>{r.status === 'completed' ? `Signed ${r.signedAt ? formatDate(r.signedAt) : ''}` : `Added ${formatDate(r.createdAt)}`}</Text>
              </View>
              <Pill label={r.status === 'completed' ? 'Signed' : 'To fill'} color={r.status === 'completed' ? colors.success : colors.warning} />
            </TouchableOpacity>
          ))
        )}

        <View style={{ height: spacing.sm }} />
        <Button title="➕ Add a house form" variant="secondary" onPress={() => setPickerOpen(true)} />
        {forms.length ? <Text style={[typography.caption, { color: colors.textMuted, marginTop: 4 }]}>Tap a form to fill it in &amp; sign · long-press to delete.</Text> : null}
      </Card>

      <Modal visible={pickerOpen} transparent animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={typography.h3}>Choose a form</Text>
            <ScrollView style={{ maxHeight: 420, marginVertical: spacing.sm }}>
              <Text style={styles.group}>House-level</Text>
              {suggested.map((t) => (
                <TouchableOpacity key={t.key} style={styles.tmpl} disabled={busy} onPress={() => add({ title: t.title, fields: t.fields })}>
                  <Text style={typography.body}>{t.title}</Text>
                  <Text style={typography.caption}>{t.description}</Text>
                </TouchableOpacity>
              ))}
              <Text style={styles.group}>Other ready-made forms</Text>
              {others.map((t) => (
                <TouchableOpacity key={t.key} style={styles.tmpl} disabled={busy} onPress={() => add({ title: t.title, fields: t.fields })}>
                  <Text style={typography.body}>{t.title}</Text>
                  <Text style={typography.caption}>{t.description}</Text>
                </TouchableOpacity>
              ))}
              {templates.length ? <Text style={styles.group}>Your saved forms</Text> : null}
              {templates.map((t) => (
                <TouchableOpacity key={t.id} style={styles.tmpl} disabled={busy} onPress={() => add({ title: t.title, fields: t.fields, templateId: t.id })}>
                  <Text style={typography.body}>{t.title}</Text>
                  <Text style={typography.caption}>{t.fields.length} field{t.fields.length === 1 ? '' : 's'}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity onPress={() => setPickerOpen(false)} style={styles.cancel}><Text style={{ color: colors.textSecondary }}>Cancel</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
      <View style={{ height: spacing.xl }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider },
  icon: { fontSize: 20, marginRight: spacing.sm },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, paddingBottom: spacing.xl },
  group: { ...typography.caption, fontWeight: '800', color: colors.textMuted, textTransform: 'uppercase', marginTop: spacing.sm, marginBottom: spacing.xs },
  tmpl: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  cancel: { alignItems: 'center', paddingVertical: spacing.sm },
});
