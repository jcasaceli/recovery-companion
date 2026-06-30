import React, { useState } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Pressable, LayoutChangeEvent } from 'react-native';
import { colors, spacing, radius, typography } from '../theme';
import type { PlacedField } from '../services/db';

type FieldType = PlacedField['type'];

const TYPES: { type: FieldType; label: string; w: number; h: number }[] = [
  { type: 'signature', label: '✍️ Signature', w: 0.34, h: 0.10 },
  { type: 'initials', label: '🅰️ Initials', w: 0.14, h: 0.07 },
  { type: 'date', label: '📅 Date', w: 0.22, h: 0.06 },
  { type: 'text', label: '🔤 Text', w: 0.3, h: 0.06 },
];

/**
 * Facilitator tool: drop signature / initials / date / text boxes onto an
 * uploaded document image. Positions are stored as fractions of the image so
 * they line up at any size when the resident signs.
 */
export function DocumentFieldEditor({
  imageUri,
  fields,
  onChange,
}: {
  imageUri: string;
  fields: PlacedField[];
  onChange: (fields: PlacedField[]) => void;
}) {
  const [active, setActive] = useState<FieldType>('signature');
  const [size, setSize] = useState({ w: 0, h: 0 });

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ w: width, h: height });
  };

  const place = (e: any) => {
    if (!size.w || !size.h) return;
    const lx = e.nativeEvent.locationX;
    const ly = e.nativeEvent.locationY;
    if (!Number.isFinite(lx) || !Number.isFinite(ly)) return;
    const def = TYPES.find((t) => t.type === active)!;
    const x = Math.max(0, Math.min(1 - def.w, lx / size.w - def.w / 2));
    const y = Math.max(0, Math.min(1 - def.h, ly / size.h - def.h / 2));
    const key = `f_${active}_${fields.length}_${Math.floor(Date.now() % 100000)}`;
    onChange([...fields, { key, type: active, x, y, w: def.w, h: def.h, required: active === 'signature' }]);
  };

  const remove = (key: string) => onChange(fields.filter((f) => f.key !== key));

  return (
    <View>
      <Text style={[typography.caption, { marginBottom: spacing.xs }]}>
        Pick a field type, then tap on the document to place it. Tap a box's ✕ to remove.
      </Text>
      <View style={styles.typeRow}>
        {TYPES.map((t) => (
          <TouchableOpacity key={t.type} onPress={() => setActive(t.type)} style={[styles.typeChip, active === t.type && styles.typeChipOn]}>
            <Text style={[styles.typeChipText, active === t.type && { color: colors.textInverse }]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Pressable onPress={place} style={styles.canvas}>
        <Image source={{ uri: imageUri }} style={styles.img} resizeMode="contain" onLayout={onLayout} />
        {size.w > 0 && fields.map((f) => (
          <View
            key={f.key}
            style={[styles.box, { left: f.x * size.w, top: f.y * size.h, width: f.w * size.w, height: f.h * size.h }]}
            pointerEvents="box-none"
          >
            <Text style={styles.boxLabel} numberOfLines={1}>{labelFor(f.type)}</Text>
            <TouchableOpacity onPress={() => remove(f.key)} style={styles.boxX} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.boxXText}>✕</Text>
            </TouchableOpacity>
          </View>
        ))}
      </Pressable>
      <Text style={[typography.caption, { marginTop: spacing.xs }]}>{fields.length} field{fields.length === 1 ? '' : 's'} placed</Text>
    </View>
  );
}

export function labelFor(type: FieldType) {
  return type === 'signature' ? 'Signature' : type === 'initials' ? 'Initials' : type === 'date' ? 'Date' : 'Text';
}

const styles = StyleSheet.create({
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.sm },
  typeChip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, marginRight: spacing.xs, marginBottom: spacing.xs, borderWidth: 1, borderColor: colors.border },
  typeChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  typeChipText: { fontWeight: '600', color: colors.textSecondary, fontSize: 13 },
  canvas: { position: 'relative', backgroundColor: colors.surfaceAlt, borderRadius: radius.md, overflow: 'hidden' },
  img: { width: '100%', height: 460 },
  box: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: colors.primary,
    borderStyle: 'dashed',
    backgroundColor: 'rgba(62,142,126,0.16)',
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxLabel: { fontSize: 11, fontWeight: '700', color: colors.primaryDark },
  boxX: { position: 'absolute', top: -10, right: -10, backgroundColor: colors.crisis, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  boxXText: { color: '#fff', fontSize: 11, fontWeight: '800' },
});
