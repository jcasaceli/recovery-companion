import React, { useState } from 'react';
import { TextInput, StyleSheet } from 'react-native';
import { colors, spacing, radius, typography } from '../theme';

/**
 * Native fallback for the web Word-style editor. The rich toolbar is a web-only
 * feature; on the phone we offer a plain multi-line input. Text is stored as
 * simple HTML (newlines -> <br>) so it renders consistently for residents.
 */
function htmlToText(html: string) {
  return (html || '')
    .replace(/<br\s*\/?>(?=)/gi, '\n')
    .replace(/<\/(p|div|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}
function textToHtml(text: string) {
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<p>${esc.replace(/\n/g, '<br>')}</p>`;
}

export function RichTextEditor({
  valueHtml,
  onChangeHtml,
  placeholder,
}: {
  valueHtml: string;
  onChangeHtml: (html: string) => void;
  placeholder?: string;
}) {
  const [text, setText] = useState(htmlToText(valueHtml));
  return (
    <TextInput
      style={styles.input}
      value={text}
      onChangeText={(t) => { setText(t); onChangeHtml(textToHtml(t)); }}
      placeholder={placeholder || 'Type your agreement here…'}
      placeholderTextColor={colors.textMuted}
      multiline
      textAlignVertical="top"
    />
  );
}

const styles = StyleSheet.create({
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, minHeight: 220, fontSize: 15, lineHeight: 22, color: colors.textPrimary },
});
