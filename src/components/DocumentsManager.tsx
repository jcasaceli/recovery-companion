import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Modal, Image, Alert, ActivityIndicator, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as WebBrowser from 'expo-web-browser';
import { decode } from 'base64-arraybuffer';
import { Card, SectionTitle, Button } from './ui';
import { colors, spacing, radius, typography } from '../theme';
import { listDocuments, createDocument, deleteDocument, uploadDocumentFile, getDocumentUrl, Document } from '../services/db';
import { formatDate } from '../utils/format';

type Pending = { uri: string; fileName: string; mimeType: string; size?: number; isImage: boolean };

function iconFor(mime?: string, name?: string) {
  const m = (mime || '').toLowerCase();
  const n = (name || '').toLowerCase();
  if (m.startsWith('image/')) return '🖼️';
  if (m.includes('pdf') || n.endsWith('.pdf')) return '📄';
  if (m.includes('word') || n.endsWith('.doc') || n.endsWith('.docx')) return '📝';
  return '📎';
}

/** Staff: store and review documents (PDFs, Word docs, photos) on a resident's
 *  file. Files live in a private Storage bucket; residents can view their own. */
export function DocumentsManager({ individualId, orgId, memberName, hideHeader }: { individualId: string; orgId?: string; memberName?: string; hideHeader?: boolean }) {
  const [docs, setDocs] = useState<Document[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<Document | null>(null);
  const [showDocs, setShowDocs] = useState(false);

  const load = () => listDocuments(individualId).then(setDocs).catch(() => {});
  useEffect(() => { load(); }, [individualId]);

  const pickPhoto = async (source: 'camera' | 'library') => {
    const perm = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') { Alert.alert('Permission needed', `Allow ${source === 'camera' ? 'camera' : 'photo'} access.`); return; }
    const opts: ImagePicker.ImagePickerOptions = { quality: 0.5, allowsEditing: false };
    const r = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    const a = r.assets?.[0];
    if (r.canceled || !a) return;
    setPending({ uri: a.uri, fileName: a.fileName || `photo_${Date.now()}.jpg`, mimeType: a.mimeType || 'image/jpeg', size: a.fileSize, isImage: true });
    if (!title) setTitle(a.fileName?.replace(/\.[^.]+$/, '') || '');
  };

  const pickFile = async () => {
    const r = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/*'],
      copyToCacheDirectory: true,
    });
    const a = (r as any).assets?.[0];
    if ((r as any).canceled || !a) return;
    setPending({ uri: a.uri, fileName: a.name || `file_${Date.now()}`, mimeType: a.mimeType || 'application/octet-stream', size: a.size, isImage: (a.mimeType || '').startsWith('image/') });
    if (!title) setTitle((a.name || '').replace(/\.[^.]+$/, ''));
  };

  const add = () => {
    // On web, Alert.alert buttons don't render — go straight to the file picker
    // (it lets you choose a PDF, Word doc, or image).
    if (Platform.OS === 'web') { pickFile(); return; }
    const buttons: any[] = [
      { text: 'Choose file (PDF, Word…)', onPress: pickFile },
      { text: 'Choose photo', onPress: () => pickPhoto('library') },
      { text: 'Cancel', style: 'cancel' },
    ];
    buttons.unshift({ text: 'Take photo', onPress: () => pickPhoto('camera') });
    Alert.alert('Add a document', 'Upload a PDF, Word doc, or photo/scan.', buttons);
  };

  const save = async () => {
    if (!pending || !title.trim()) { Alert.alert('Add a title', 'Give the document a name first.'); return; }
    setBusy(true);
    try {
      const b64 = await FileSystem.readAsStringAsync(pending.uri, { encoding: FileSystem.EncodingType.Base64 });
      const bytes = decode(b64);
      const path = await uploadDocumentFile(individualId, pending.fileName, bytes, pending.mimeType);
      await createDocument({ orgId, individualId, title: title.trim(), storagePath: path, fileName: pending.fileName, mimeType: pending.mimeType, sizeBytes: pending.size });
      setPending(null); setTitle('');
      load();
    } catch (e: any) { Alert.alert('Could not upload', e?.message ?? 'Try again.'); }
    finally { setBusy(false); }
  };

  const open = async (d: Document) => {
    if (d.storagePath) {
      const isImage = (d.mimeType || '').startsWith('image/');
      // On web, a PDF/Word opens in a new tab — but window.open AFTER the async
      // signed-URL fetch gets popup-blocked. So open a blank tab synchronously
      // now (inside the click) and point it at the file once the URL is ready.
      const g: any = globalThis;
      const win = !isImage && Platform.OS === 'web' && typeof g.open === 'function' ? g.open('', '_blank') : null;
      const url = await getDocumentUrl(d.storagePath);
      if (!url) { if (win) win.close(); Alert.alert('Could not open', 'Please try again.'); return; }
      if (isImage) { setViewing({ ...d, fileData: url }); return; } // in-app image viewer (web + native)
      if (Platform.OS === 'web') {
        if (win) win.location.href = url; else g.open(url, '_blank');
      } else {
        await WebBrowser.openBrowserAsync(url); // PDF / Word open in a viewer
      }
    } else if (d.fileData) {
      setViewing(d); // legacy inline image
    }
  };

  const remove = (d: Document) => {
    Alert.alert('Delete document?', `Remove “${d.title}”? This can’t be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await deleteDocument(d.id).catch(() => {}); load(); } },
    ]);
  };

  return (
    <>
      {hideHeader ? null : <SectionTitle>Documents</SectionTitle>}
      <Card>
        <Text style={[typography.caption, { marginBottom: spacing.sm }]}>
          Store {memberName ? `${memberName}’s` : 'this resident’s'} paperwork — PDFs, Word docs, IDs, insurance, house rules. They can view these too.
        </Text>

        {pending ? (
          <View style={styles.pendingBox}>
            {pending.isImage ? (
              <Image source={{ uri: pending.uri }} style={styles.preview} resizeMode="cover" />
            ) : (
              <View style={styles.fileChip}><Text style={{ fontSize: 22 }}>{iconFor(pending.mimeType, pending.fileName)}</Text><Text style={[typography.body, { flex: 1 }]} numberOfLines={1}>{pending.fileName}</Text></View>
            )}
            <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Document name (e.g. Signed lease)" placeholderTextColor={colors.textMuted} />
            <Button title={busy ? 'Uploading…' : 'Save document'} onPress={save} disabled={busy} />
            <TouchableOpacity onPress={() => { setPending(null); setTitle(''); }} style={{ alignItems: 'center', paddingVertical: spacing.sm }}>
              <Text style={{ color: colors.textSecondary }}>Discard</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Button title="➕ Add a document" variant="secondary" onPress={add} />
        )}

        {docs.length ? (
          <View style={{ marginTop: spacing.sm }}>
            <TouchableOpacity style={styles.collapseBtn} onPress={() => setShowDocs((v) => !v)}>
              <Text style={styles.collapseText}>{showDocs ? '▾' : '▸'} View documents ({docs.length})</Text>
            </TouchableOpacity>
            {showDocs ? (
              <>
                {docs.map((d) => (
                  <TouchableOpacity key={d.id} style={styles.row} onPress={() => open(d)} onLongPress={() => remove(d)}>
                    <Text style={styles.icon}>{iconFor(d.mimeType, d.fileName)}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={typography.body}>{d.title}</Text>
                      <Text style={typography.caption}>{d.fileName ? `${d.fileName} · ` : ''}Added {formatDate(d.createdAt)}</Text>
                    </View>
                    <Text style={[typography.caption, { color: colors.primary }]}>Open</Text>
                  </TouchableOpacity>
                ))}
                <Text style={[typography.caption, { color: colors.textMuted, marginTop: 4 }]}>Long-press a document to delete it.</Text>
              </>
            ) : null}
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
  fileChip: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  input: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, fontSize: 15, color: colors.textPrimary, marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider },
  icon: { fontSize: 20, marginRight: spacing.sm },
  collapseBtn: { paddingVertical: spacing.sm },
  collapseText: { ...typography.caption, color: colors.primary, fontWeight: '800' },
  viewBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center', padding: spacing.md },
  viewTitle: { ...typography.h3, color: colors.textInverse, marginBottom: spacing.md, textAlign: 'center' },
  full: { width: '100%', height: '70%' },
  closeBtn: { marginTop: spacing.lg, paddingHorizontal: spacing.xl, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.textInverse },
  closeText: { color: colors.textInverse, fontWeight: '700' },
});
