import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Modal, Image, Alert, ActivityIndicator, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Card, SectionTitle, Button } from './ui';
import { colors, spacing, radius, typography } from '../theme';
import { listDocuments, createDocument, deleteDocument, Document } from '../services/db';
import { formatDate } from '../utils/format';

/** Staff: store and review documents on a member's file (intake paperwork, IDs,
 *  insurance cards, house rules, etc.). Read-only for the member elsewhere. */
export function DocumentsManager({ individualId, orgId, memberName }: { individualId: string; orgId?: string; memberName?: string }) {
  const [docs, setDocs] = useState<Document[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<Document | null>(null);

  const load = () => listDocuments(individualId).then(setDocs).catch(() => {});
  useEffect(() => { load(); }, [individualId]);

  const pickFrom = async (source: 'camera' | 'library') => {
    const perm = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('Permission needed', `Allow ${source === 'camera' ? 'camera' : 'photo'} access to add a document.`);
      return;
    }
    const opts: ImagePicker.ImagePickerOptions = { quality: 0.3, base64: true, allowsEditing: false };
    const result = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (result.canceled || !result.assets?.[0]?.base64) return;
    setPending(`data:image/jpeg;base64,${result.assets[0].base64}`);
  };

  const add = () => {
    const buttons: any[] = [
      { text: 'Choose from library', onPress: () => pickFrom('library') },
      { text: 'Cancel', style: 'cancel' },
    ];
    if (Platform.OS !== 'web') buttons.unshift({ text: 'Take photo', onPress: () => pickFrom('camera') });
    Alert.alert('Add a document', 'Add a photo or scan of the document.', buttons);
  };

  const save = async () => {
    if (!pending || !title.trim()) { Alert.alert('Add a title', 'Give the document a name first.'); return; }
    setBusy(true);
    try {
      await createDocument({ orgId, individualId, title: title.trim(), fileData: pending });
      setPending(null); setTitle('');
      load();
    } catch (e: any) { Alert.alert('Could not save', e?.message ?? 'Try again.'); }
    finally { setBusy(false); }
  };

  const remove = (d: Document) => {
    Alert.alert('Delete document?', `Remove “${d.title}”? This can’t be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await deleteDocument(d.id).catch(() => {}); load(); } },
    ]);
  };

  return (
    <>
      <SectionTitle>Documents</SectionTitle>
      <Card>
        <Text style={[typography.caption, { marginBottom: spacing.sm }]}>
          Store {memberName ? `${memberName}’s` : 'this member’s'} paperwork — intake forms, ID, insurance, house rules. They can view these too.
        </Text>

        {pending ? (
          <View style={styles.pendingBox}>
            <Image source={{ uri: pending }} style={styles.preview} resizeMode="cover" />
            <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Document name (e.g. Driver’s license)" placeholderTextColor={colors.textMuted} />
            <Button title={busy ? 'Saving…' : 'Save document'} onPress={save} disabled={busy} />
            <TouchableOpacity onPress={() => { setPending(null); setTitle(''); }} style={{ alignItems: 'center', paddingVertical: spacing.sm }}>
              <Text style={{ color: colors.textSecondary }}>Discard</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Button title="➕ Add a document" variant="secondary" onPress={add} />
        )}

        {docs.length ? (
          <View style={{ marginTop: spacing.sm }}>
            {docs.map((d) => (
              <TouchableOpacity key={d.id} style={styles.row} onPress={() => setViewing(d)} onLongPress={() => remove(d)}>
                <Text style={styles.icon}>📄</Text>
                <View style={{ flex: 1 }}>
                  <Text style={typography.body}>{d.title}</Text>
                  <Text style={typography.caption}>Added {formatDate(d.createdAt)}</Text>
                </View>
                <Text style={[typography.caption, { color: colors.primary }]}>View</Text>
              </TouchableOpacity>
            ))}
            <Text style={[typography.caption, { color: colors.textMuted, marginTop: 4 }]}>Long-press a document to delete it.</Text>
          </View>
        ) : null}
      </Card>

      <Modal visible={!!viewing} transparent animationType="fade" onRequestClose={() => setViewing(null)}>
        <View style={styles.viewBackdrop}>
          <Text style={styles.viewTitle}>{viewing?.title}</Text>
          {viewing?.fileData ? (
            <Image source={{ uri: viewing.fileData }} style={styles.full} resizeMode="contain" />
          ) : (
            <ActivityIndicator color={colors.textInverse} />
          )}
          <TouchableOpacity onPress={() => setViewing(null)} style={styles.closeBtn}>
            <Text style={styles.closeText}>Close</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  pendingBox: { marginBottom: spacing.sm },
  preview: { width: '100%', height: 180, borderRadius: radius.md, marginBottom: spacing.sm, backgroundColor: colors.surfaceAlt },
  input: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, fontSize: 15, color: colors.textPrimary, marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider },
  icon: { fontSize: 20, marginRight: spacing.sm },
  viewBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center', padding: spacing.md },
  viewTitle: { ...typography.h3, color: colors.textInverse, marginBottom: spacing.md, textAlign: 'center' },
  full: { width: '100%', height: '70%' },
  closeBtn: { marginTop: spacing.lg, paddingHorizontal: spacing.xl, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.textInverse },
  closeText: { color: colors.textInverse, fontWeight: '700' },
});
