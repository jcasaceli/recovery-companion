/**
 * Crisis resources card. Tapping a resource opens the phone dialer / SMS app.
 * Used both inline in the assistant chat (when distress is detected) and as a
 * permanent fixture on the Resources tab.
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { colors, spacing, radius } from '../theme';
import { CRISIS_RESOURCES, CrisisResource } from '../services/crisis';

function openResource(r: CrisisResource) {
  if (r.phone) {
    Linking.openURL(`tel:${r.phone.replace(/[^0-9]/g, '')}`).catch(() => {});
  } else if (r.sms) {
    const sep = '?'; // body param
    Linking.openURL(`sms:${r.sms.number}${sep}body=${encodeURIComponent(r.sms.body)}`).catch(() => {});
  } else if (r.url) {
    Linking.openURL(r.url).catch(() => {});
  }
}

export function CrisisResources({ compact = false }: { compact?: boolean }) {
  return (
    <View style={[styles.wrap, compact ? styles.compact : null]}>
      {!compact ? (
        <Text style={styles.heading}>If you need help right now</Text>
      ) : null}
      {CRISIS_RESOURCES.map((r) => (
        <TouchableOpacity
          key={r.name}
          activeOpacity={0.7}
          style={styles.row}
          onPress={() => openResource(r)}
        >
          <View style={styles.rowText}>
            <Text style={styles.name}>{r.name}</Text>
            <Text style={styles.desc}>{r.description}</Text>
          </View>
          <Text style={styles.action}>
            {r.phone ? 'Call' : r.sms ? 'Text' : 'Open'}
          </Text>
        </TouchableOpacity>
      ))}
      <Text style={styles.emergency}>In an emergency, call 911.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.crisisBg,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.crisis,
  },
  compact: { marginTop: spacing.sm },
  heading: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.crisis,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm + 2,
    marginBottom: spacing.sm,
  },
  rowText: { flex: 1, paddingRight: spacing.sm },
  name: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  desc: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  action: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.crisis,
  },
  emergency: {
    fontSize: 13,
    color: colors.crisis,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 2,
  },
});
