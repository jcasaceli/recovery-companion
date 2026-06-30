import React from 'react';
import { View, Text } from 'react-native';
import { colors, spacing, typography } from '../theme';

/**
 * Native fallback HTML viewer. Without an HTML engine we render a readable
 * approximation: paragraphs become spaced lines and list items become bullets.
 * Bold/italic and alignment are dropped on the phone (full fidelity is on web).
 */
const BULLET = '•';

function decode(s: string) {
  return s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function toLines(html: string): { text: string; bullet?: boolean }[] {
  if (!html) return [];
  const out: { text: string; bullet?: boolean }[] = [];
  const normalized = html
    .replace(/<li[^>]*>/gi, `\n${BULLET} `)
    .replace(/<\/li>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|ul|ol)>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  for (const raw of normalized.split('\n')) {
    const trimmed = raw.trim();
    const bullet = trimmed.startsWith(BULLET);
    const text = decode((bullet ? trimmed.slice(1) : trimmed).trim());
    if (text) out.push({ text, bullet });
  }
  return out;
}

export function RichTextView({ html }: { html: string }) {
  const lines = toLines(html);
  if (!lines.length) return <Text style={typography.bodySecondary}>—</Text>;
  return (
    <View>
      {lines.map((l, i) => (
        <View key={i} style={{ flexDirection: 'row', marginBottom: spacing.xs }}>
          {l.bullet ? <Text style={[typography.body, { marginRight: 6 }]}>{BULLET}</Text> : null}
          <Text style={[typography.body, { flex: 1, color: colors.textPrimary, lineHeight: 22 }]}>{l.text}</Text>
        </View>
      ))}
    </View>
  );
}
