import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { colors, spacing, radius, typography } from '../theme';
import { PickedFile, pickDocument, pickPhoto, attachmentIcon, isWeb } from '../utils/attachments';

/** A controlled picker for a single STAFF-ONLY file attachment (notes / UA).
 *  Makes it explicit that the resident can never see the attached file. */
export function StaffAttachmentPicker({ value, onChange, memberName }: {
  value: PickedFile | null;
  onChange: (f: PickedFile | null) => void;
  memberName?: string;
}) {
  const add = async () => {
    if (isWeb) { const f = await pickDocument(); if (f) onChange(f); return; }
    Alert.alert('Attach a file', 'Photo or document (PDF/Word). Only staff can see it.', [
      { text: 'Take photo', onPress: async () => { const f = await pickPhoto('camera'); if (f) onChange(f); } },
      { text: 'Choose photo', onPress: async () => { const f = await pickPhoto('library'); if (f) onChange(f); } },
      { text: 'Choose file (PDF, Word…)', onPress: async () => { const f = await pickDocument(); if (f) onChange(f); } },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <View style={{ marginBottom: spacing.sm }}>
      {value ? (
        <View style={styles.chip}>
          <Text style={{ fontSize: 18 }}>{attachmentIcon(value.mimeType, value.fileName)}</Text>
          <Text style={[typography.caption, { flex: 1 }]} numberOfLines={1}>{value.fileName}</Text>
          <TouchableOpacity onPress={() => onChange(null)} hitSlop={8}>
            <Text style={{ color: colors.textMuted, fontSize: 15 }}>✕</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity onPress={add} style={styles.attachBtn}>
          <Text style={styles.attachText}>📎 Attach a file (photo or PDF)</Text>
        </TouchableOpacity>
      )}
      <Text style={[typography.caption, { color: colors.textMuted, marginTop: 4 }]}>
        🔒 Staff only — {memberName || 'the resident'} can’t see uploaded photos or documents.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  attachBtn: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, borderStyle: 'dashed', paddingVertical: spacing.sm, alignItems: 'center' },
  attachText: { ...typography.caption, color: colors.primary, fontWeight: '700' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
});
