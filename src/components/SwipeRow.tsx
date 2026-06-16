import React, { useMemo, useRef } from 'react';
import { Animated, PanResponder, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, spacing, radius } from '../theme';

/**
 * Swipe-left-to-reveal-delete row. Uses the built-in Animated + PanResponder
 * (no extra native dependency). Horizontal drags reveal a Delete action;
 * vertical drags pass through to the surrounding scroll view.
 */
export function SwipeRow({ children, onDelete }: { children: React.ReactNode; onDelete: () => void }) {
  const tx = useRef(new Animated.Value(0)).current;
  const open = useRef(false);
  const ACTION_W = 84;

  const snap = (to: number) => {
    open.current = to !== 0;
    Animated.spring(tx, { toValue: to, useNativeDriver: true, speed: 20, bounciness: 0 }).start();
  };

  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > Math.abs(g.dy) && Math.abs(g.dx) > 8,
        onPanResponderMove: (_e, g) => {
          const base = open.current ? -ACTION_W : 0;
          const next = Math.min(0, Math.max(-ACTION_W - 20, base + g.dx));
          tx.setValue(next);
        },
        onPanResponderRelease: (_e, g) => {
          const base = open.current ? -ACTION_W : 0;
          snap(base + g.dx < -ACTION_W / 2 ? -ACTION_W : 0);
        },
      }),
    [],
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.actionLayer}>
        <TouchableOpacity style={styles.deleteBtn} onPress={() => { snap(0); onDelete(); }}>
          <Text style={styles.deleteText}>Delete</Text>
        </TouchableOpacity>
      </View>
      <Animated.View style={{ transform: [{ translateX: tx }] }} {...responder.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative' },
  actionLayer: { ...StyleSheet.absoluteFillObject, alignItems: 'flex-end', justifyContent: 'center' },
  deleteBtn: { backgroundColor: colors.crisis, borderRadius: radius.md, height: '82%', width: 80, alignItems: 'center', justifyContent: 'center' },
  deleteText: { color: colors.textInverse, fontWeight: '700' },
});
