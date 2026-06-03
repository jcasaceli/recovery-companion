import React, { useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, PanResponder, TouchableOpacity, LayoutChangeEvent } from 'react-native';
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
  const [strokes, setStrokes] = useState<string[]>([]);
  const [, force] = useState(0);
  const current = useRef('');

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => {
          const { locationX, locationY } = e.nativeEvent;
          current.current = `M${locationX.toFixed(1)},${locationY.toFixed(1)}`;
          force((n) => n + 1);
        },
        onPanResponderMove: (e) => {
          const { locationX, locationY } = e.nativeEvent;
          current.current += ` L${locationX.toFixed(1)},${locationY.toFixed(1)}`;
          force((n) => n + 1);
        },
        onPanResponderRelease: () => {
          if (current.current) {
            setStrokes((s) => {
              const next = [...s, current.current];
              onChange(next);
              return next;
            });
          }
          current.current = '';
        },
      }),
    [onChange],
  );

  const clear = () => {
    setStrokes([]);
    current.current = '';
    onChange([]);
    force((n) => n + 1);
  };

  const all = current.current ? [...strokes, current.current] : strokes;

  return (
    <View>
      <View style={[styles.pad, { height }]} {...responder.panHandlers}>
        <Svg width="100%" height="100%">
          {all.map((d, i) => (
            <Path key={i} d={d} stroke={colors.textPrimary} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          ))}
        </Svg>
        {all.length === 0 ? <Text style={styles.hint}>Sign here with your finger</Text> : null}
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
