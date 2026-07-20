import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Image, ActivityIndicator, Alert } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { openResolvedUrl } from '../utils/openFile';
import { Screen, ScreenTitle, Card } from '../components/ui';
import { colors, spacing, radius, typography } from '../theme';
import { listMyDocuments, getDocumentUrl, getDocumentFileData, Document } from '../services/db';
import { formatDate } from '../utils/format';

function iconFor(mime?: string, name?: string) {
  const m = (mime || '').toLowerCase();
  const n = (name || '').toLowerCase();
  if (m.startsWith('image/')) return '🖼️';
  if (m.includes('pdf') || n.endsWith('.pdf')) return '📄';
  if (m.includes('word') || n.endsWith('.doc') || n.endsWith('.docx')) return '📝';
  return '📎';
}

/** Member: read-only view of the documents staff have stored on their file. */
export function MemberDocumentsScreen() {
  const [docs, setDocs] = useState<Document[] | null>(null);
  const [viewing, setViewing] = useState<Document | null>(null);

  useEffect(() => { listMyDocuments().then(setDocs).catch(() => setDocs([])); }, []);

  const open = (d: Document) => {
    if (d.storagePath) {
      // Images preview in-app (no popup); PDFs/Word open in a tab (web-safe).
      if ((d.mimeType || '').startsWith('image/')) {
        getDocumentUrl(d.storagePath).then((url) => {
          if (url) setViewing({ ...d, fileData: url });
          else Alert.alert('Could not open', 'Please try again.');
        });
        return;
      }
      openResolvedUrl(() => getDocumentUrl(d.storagePath!), () => Alert.alert('Could not open', 'Please try again.'));
    } else {
      getDocumentFileData(d.id)
        .then((data) => { if (data) setViewing({ ...d, fileData: data }); else Alert.alert('Could not open', 'This document has no file attached.'); })
        .catch(() => Alert.alert('Could not open', 'Please try again.'));
    }
  };

  return (
    <Screen edges={[]}>
      <ScreenTitle title="My documents" subtitle="Paperwork your facilitator has shared" />
      {docs === null ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
      ) : docs.length === 0 ? (
        <Card><Text style={typography.bodySecondary}>No documents have been shared with you yet.</Text></Card>
      ) : (
        <Card>
          {docs.map((d) => (
            <TouchableOpacity key={d.id} style={styles.row} onPress={() => open(d)}>
              <Text style={styles.icon}>{iconFor(d.mimeType, d.fileName)}</Text>
              <View style={{ flex: 1 }}>
                <Text style={typography.body}>{d.title}</Text>
                <Text style={typography.caption}>{d.fileName ? `${d.fileName} · ` : ''}Added {formatDate(d.createdAt)}</Text>
              </View>
              <Text style={[typography.caption, { color: colors.primary }]}>Open</Text>
            </TouchableOpacity>
          ))}
        </Card>
      )}

      <Modal visible={!!viewing} transparent animationType="fade" onRequestClose={() => setViewing(null)}>
        <View style={styles.viewBackdrop}>
          <Text style={styles.viewTitle}>{viewing?.title}</Text>
          {viewing?.fileData ? (
            <Image source={{ uri: viewing.fileData }} style={styles.full} resizeMode="contain" />
          ) : <ActivityIndicator color={colors.textInverse} />}
          <TouchableOpacity onPress={() => setViewing(null)} style={styles.closeBtn}>
            <Text style={styles.closeText}>Close</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider },
  icon: { fontSize: 20, marginRight: spacing.sm },
  viewBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center', padding: spacing.md },
  viewTitle: { ...typography.h3, color: colors.textInverse, marginBottom: spacing.md, textAlign: 'center' },
  full: { width: '100%', height: '70%' },
  closeBtn: { marginTop: spacing.lg, paddingHorizontal: spacing.xl, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.textInverse },
  closeText: { color: colors.textInverse, fontWeight: '700' },
});
