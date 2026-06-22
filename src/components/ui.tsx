/** Small reusable UI primitives shared across screens. */

import React, { ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { colors, spacing, radius, typography, shadow } from '../theme';
import { useAppState } from '../state/store';
import { useAuth } from '../state/auth';

/** Persistent "Enter sober living code" banner for a signed-in resident who
 *  hasn't connected to a sober living yet. Renders inside the screen's safe
 *  area (so it never double-pads) and opens the LinkMember modal. */
function ConnectBanner() {
  const nav = useNavigation<any>();
  const auth = useAuth();
  const { cloudHasIndividual } = useAppState();
  const show = auth.configured && auth.profile?.role !== 'facilitator' && !cloudHasIndividual;
  if (!show) return null;
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={() => nav.navigate('LinkMember')} style={styles.connectBanner}>
      <Ionicons name="key-outline" size={16} color={colors.textInverse} />
      <Text style={styles.connectText}>Enter sober living code</Text>
      <Ionicons name="chevron-forward" size={16} color={colors.textInverse} />
    </TouchableOpacity>
  );
}

export function Screen({
  children,
  scroll = true,
  edges = ['top'],
}: {
  children: ReactNode;
  scroll?: boolean;
  // Screens shown inside a navigator header already get the top inset from the
  // header — pass edges={[]} there to avoid a redundant blank gap up top.
  edges?: ('top' | 'right' | 'bottom' | 'left')[];
}) {
  return (
    <SafeAreaView style={styles.screen} edges={edges}>
      <ConnectBanner />
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={styles.flex}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function ScreenTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.titleBlock}>
      <Text style={typography.h1}>{title}</Text>
      {subtitle ? <Text style={[typography.bodySecondary, { marginTop: 4 }]}>{subtitle}</Text> : null}
    </View>
  );
}

export function Card({
  children,
  style,
  onPress,
  onLongPress,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  onLongPress?: () => void;
}) {
  const inner = <View style={[styles.card, style]}>{children}</View>;
  if (onPress || onLongPress) {
    return (
      <TouchableOpacity activeOpacity={0.7} onPress={onPress} onLongPress={onLongPress}>
        {inner}
      </TouchableOpacity>
    );
  }
  return inner;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

export function Pill({ label, color }: { label: string; color?: string }) {
  return (
    <View style={[styles.pill, color ? { backgroundColor: color } : null]}>
      <Text style={styles.pillText}>{label}</Text>
    </View>
  );
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
}) {
  const isPrimary = variant === 'primary';
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.button,
        isPrimary ? styles.buttonPrimary : styles.buttonSecondary,
        disabled ? styles.buttonDisabled : null,
      ]}
    >
      <Text style={[styles.buttonText, !isPrimary ? { color: colors.primary } : null]}>
        {title}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  scrollContent: { padding: spacing.md, paddingBottom: spacing.xxl },
  connectBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.primary, paddingVertical: 11, paddingHorizontal: 16,
  },
  connectText: { color: colors.textInverse, fontWeight: '700', fontSize: 14 },
  titleBlock: { marginBottom: spacing.lg, marginTop: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadow.card,
  },
  sectionTitle: {
    ...typography.h3,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  pill: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    marginRight: spacing.xs,
    marginBottom: spacing.xs,
  },
  pillText: { fontSize: 12, color: colors.textSecondary, fontWeight: '500' },
  button: {
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPrimary: { backgroundColor: colors.primary },
  buttonSecondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { ...typography.button },
});
