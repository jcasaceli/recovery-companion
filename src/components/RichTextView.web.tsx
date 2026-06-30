import React from 'react';
import { colors } from '../theme';

/** Render the CRM-authored agreement HTML for reading on web. */
export function RichTextView({ html }: { html: string }) {
  return (
    <div
      style={{ fontSize: 15, lineHeight: 1.6, color: colors.textPrimary, wordBreak: 'break-word' }}
      // Authored by the org's own staff in the CRM; rendered back to their residents.
      dangerouslySetInnerHTML={{ __html: html || '' }}
    />
  );
}
