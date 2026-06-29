import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { colors, spacing, radius, typography } from '../theme';
import { useAuth } from '../state/auth';

type IconName = keyof typeof Ionicons.glyphMap;

const NAV: Record<string, { label: string; icon: IconName }> = {
  Dashboard: { label: 'Dashboard', icon: 'grid-outline' },
  Clients: { label: 'Clients', icon: 'people-outline' },
  Forms: { label: 'Forms', icon: 'document-text-outline' },
  Payments: { label: 'Payments', icon: 'card-outline' },
  Messages: { label: 'Messages', icon: 'megaphone-outline' },
  ReferFriend: { label: 'Refer a Friend', icon: 'gift-outline' },
  Account: { label: 'Settings', icon: 'settings-outline' },
};

/**
 * Left navigation rail for the facilitator console on wide web screens — a
 * CRM-style sidebar (logo on top, vertical nav items, sign-out at the bottom).
 * Rendered as the bottom-tab navigator's `tabBar` with tabBarPosition="left",
 * so it drives the same routes the mobile tab bar does.
 */
export function FacilitatorSidebar({ state, navigation }: BottomTabBarProps) {
  const auth = useAuth();

  return (
    <View style={styles.rail}>
      <View style={styles.brand}>
        <View style={styles.logoMark}>
          <Ionicons name="leaf" size={20} color={colors.textInverse} />
        </View>
        <Text style={styles.brandText}>Sober Living{'\n'}Companion</Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: spacing.sm }}>
        {state.routes.map((route, index) => {
          const cfg = NAV[route.name] ?? { label: route.name, icon: 'ellipse-outline' as IconName };
          const focused = state.index === index;
          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
          };
          return (
            <TouchableOpacity
              key={route.key}
              onPress={onPress}
              style={[styles.item, focused && styles.itemActive]}
              accessibilityRole="button"
              accessibilityState={focused ? { selected: true } : {}}
            >
              <Ionicons
                name={cfg.icon}
                size={20}
                color={focused ? colors.textInverse : 'rgba(255,255,255,0.75)'}
                style={{ width: 26 }}
              />
              <Text style={[styles.itemLabel, focused && styles.itemLabelActive]}>{cfg.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <TouchableOpacity style={styles.signOut} onPress={() => auth.signOut()}>
        <Ionicons name="log-out-outline" size={18} color="rgba(255,255,255,0.75)" style={{ width: 26 }} />
        <Text style={styles.itemLabel}>Sign out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  rail: {
    width: 232,
    backgroundColor: colors.primaryDark,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.md,
    marginBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.18)',
  },
  logoMark: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  brandText: { color: colors.textInverse, fontWeight: '800', fontSize: 15, lineHeight: 18 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    marginBottom: 2,
  },
  itemActive: { backgroundColor: 'rgba(255,255,255,0.16)' },
  itemLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 15, fontWeight: '600' },
  itemLabelActive: { color: colors.textInverse, fontWeight: '700' },
  signOut: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.18)',
    marginTop: spacing.sm,
  },
});
