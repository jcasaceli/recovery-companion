import React, { useMemo, useRef } from 'react';
import { Animated, PanResponder, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, radius, spacing } from '../theme';

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

  const responder = useMemo(() => {
    // Claim the gesture only for clearly-horizontal drags, and capture it so the
    // row's own touchables / the surrounding ScrollView don't swallow it.
    const wantsHorizontal = (_e: any, g: any) =>
      Math.abs(g.dx) > Math.abs(g.dy) && Math.abs(g.dx) > 6;
    return PanResponder.create({
      onMoveShouldSetPanResponder: wantsHorizontal,
      onMoveShouldSetPanResponderCapture: wantsHorizontal,
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_e, g) => {
        const base = open.current ? -ACTION_W : 0;
        const next = Math.min(0, Math.max(-ACTION_W - 16, base + g.dx));
        tx.setValue(next);
      },
      onPanResponderRelease: (_e, g) => {
        const base = open.current ? -ACTION_W : 0;
        snap(base + g.dx < -ACTION_W / 2 ? -ACTION_W : 0);
      },
    });
  }, []);

  return (
    <View style={styles.wrap}>
      {/* Red action layer sits behind the row; revealed as the row slides left. */}
      <View style={styles.actionLayer}>
        <TouchableOpacity style={styles.deleteBtn} activeOpacity={0.8} onPress={() => { snap(0); onDelete(); }}>
          <Text style={styles.deleteText}>Delete</Text>
        </TouchableOpacity>
      </View>
      <Animated.View style={[styles.fg, { transform: [{ translateX: tx }] }]} {...responder.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // overflow:hidden + rounded keeps the red contained; marginTop spaces rows.
  wrap: { position: 'relative', borderRadius: radius.md, overflow: 'hidden', marginTop: spacing.sm },
  actionLayer: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.crisis, alignItems: 'flex-end', justifyContent: 'center' },
  deleteBtn: { width: 84, height: '100%', alignItems: 'center', justifyContent: 'center' },
  deleteText: { color: colors.textInverse, fontWeight: '700' },
  // Solid foreground fully covers the red when the row is closed.
  fg: { backgroundColor: colors.surfaceAlt },
});
