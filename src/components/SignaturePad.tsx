import React, { useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, PanResponder, TouchableOpacity, LayoutChangeEvent, Platform } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors, spacing, radius, typography } from '../theme';

/**
 * Finger-drawn signature capture, stored as vector strokes (SVG path strings).
 * No external dependency — uses react-native-svg + PanResponder. The same path
 * data renders read-only in SignatureView so the facilitator sees the signature.
 */
export function SignaturePad({
  onChange,
  height = 200,
}: {
  onChange: (paths: string[]) => void;
  height?: number;
}) {
  // Strokes live in a ref (not state) so we can notify the parent from the
  // event handler — never from inside a setState updater, which runs during
  // render and would trigger "cannot update a component while rendering".
  const strokesRef = useRef<string[]>([]);
  const current = useRef('');
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);

  // Origin of the pad in window coords — used to compute local x/y on web,
  // where nativeEvent.locationX/Y can be missing/relative to the page.
  const padRef = useRef<View>(null);
  const origin = useRef({ x: 0, y: 0 });
  const measure = () => { try { (padRef.current as any)?.measureInWindow?.((x: number, y: number) => { origin.current = { x, y }; }); } catch {} };

  const coords = (e: any) => {
    const ne = e.nativeEvent || {};
    let x = ne.locationX;
    let y = ne.locationY;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      const px = ne.pageX ?? ne.changedTouches?.[0]?.pageX;
      const py = ne.pageY ?? ne.changedTouches?.[0]?.pageY;
      x = (px ?? 0) - origin.current.x;
      y = (py ?? 0) - origin.current.y;
    }
    return { x: Number.isFinite(x) ? x : 0, y: Number.isFinite(y) ? y : 0 };
  };

  // Push the in-progress stroke into the committed list and notify the parent.
  const commitStroke = () => {
    if (!current.current) return;
    strokesRef.current = [...strokesRef.current, current.current];
    current.current = '';
    onChange(strokesRef.current);
    rerender();
  };

  const responder = useMemo(
    () =>
      PanResponder.create({
        // Capture the touch before any parent ScrollView so drawing never turns
        // into a scroll (which was wiping strokes on the Forms screen).
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: (e) => {
          measure();
          const { x, y } = coords(e);
          current.current = `M${x.toFixed(1)},${y.toFixed(1)}`;
          rerender();
        },
        onPanResponderMove: (e) => {
          const { x, y } = coords(e);
          current.current += ` L${x.toFixed(1)},${y.toFixed(1)}`;
          rerender();
        },
        // Commit the stroke on both a normal lift AND a forced termination, so a
        // stray gesture-steal can't erase what was just drawn.
        onPanResponderRelease: () => commitStroke(),
        onPanResponderTerminate: () => commitStroke(),
      }),
    [onChange],
  );

  const clear = () => {
    strokesRef.current = [];
    current.current = '';
    onChange([]);
    rerender();
  };

  const all = current.current ? [...strokesRef.current, current.current] : strokesRef.current;

  return (
    <View>
      <View
        ref={padRef}
        onLayout={measure}
        style={[styles.pad, { height }, Platform.OS === 'web' ? webPadStyle : null]}
        {...responder.panHandlers}
      >
        <Svg width="100%" height="100%" pointerEvents="none">
          {all.map((d, i) => (
            <Path key={i} d={d} stroke={colors.textPrimary} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          ))}
        </Svg>
        {all.length === 0 ? <Text style={styles.hint} pointerEvents="none">Sign here with your finger or mouse</Text> : null}
      </View>
      <TouchableOpacity onPress={clear} style={styles.clear}>
        <Text style={styles.clearText}>Clear</Text>
      </TouchableOpacity>
    </View>
  );
}

/** Read-only render of a stored signature. */
export function SignatureView({
  paths,
  height = 120,
  onLayout,
}: {
  paths: string[];
  height?: number;
  onLayout?: (e: LayoutChangeEvent) => void;
}) {
  return (
    <View style={[styles.viewBox, { height }]} onLayout={onLayout}>
      <Svg width="100%" height="100%">
        {(paths ?? []).map((d, i) => (
          <Path key={i} d={d} stroke={colors.textPrimary} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        ))}
      </Svg>
    </View>
  );
}

// Web only: stop the browser from hijacking the drag (scroll/select) so the
// pan gesture reaches the responder, and show a drawing cursor.
const webPadStyle: any = { touchAction: 'none', userSelect: 'none', cursor: 'crosshair' };

const styles = StyleSheet.create({
  pad: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderStyle: 'dashed',
    overflow: 'hidden',
    justifyContent: 'center',
  },
  hint: { ...typography.caption, position: 'absolute', alignSelf: 'center', color: colors.textMuted },
  clear: { alignSelf: 'flex-end', paddingVertical: spacing.xs, paddingHorizontal: spacing.sm },
  clearText: { color: colors.primary, fontWeight: '600' },
  viewBox: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
});
