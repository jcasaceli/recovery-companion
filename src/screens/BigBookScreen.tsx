import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Modal, Alert, ActivityIndicator } from 'react-native';
import { Screen, ScreenTitle, Card, Button } from '../components/ui';
import { colors, spacing, radius, typography } from '../theme';
import { loadPages, importText, clearPages, loadStars, saveStars } from '../services/bigbook';

export function BigBookScreen() {
  const [pages, setPages] = useState<string[] | null>(null);
  const [stars, setStars] = useState<number[]>([]);
  const [index, setIndex] = useState(0);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [showStars, setShowStars] = useState(false);

  const [importOpen, setImportOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadPages().then(setPages).catch(() => setPages([]));
    loadStars().then(setStars).catch(() => {});
  }, []);

  const doImport = async () => {
    if (!draft.trim()) return;
    setBusy(true);
    try {
      const p = await importText(draft);
      setPages(p); setIndex(0); setDraft(''); setImportOpen(false);
      if (p.length === 0) Alert.alert('Nothing to read', 'That text was empty.');
    } catch (e: any) { Alert.alert('Could not import', e?.message ?? 'Try again.'); }
    finally { setBusy(false); }
  };

  const replaceText = () => {
    Alert.alert('Replace the text?', 'This clears the current text and bookmarks so you can paste a new copy.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Replace', style: 'destructive', onPress: async () => { await clearPages(); setPages([]); setStars([]); setIndex(0); setImportOpen(true); } },
    ]);
  };

  const toggleStar = async (i: number) => {
    const next = stars.includes(i) ? stars.filter((x) => x !== i) : [...stars, i].sort((a, b) => a - b);
    setStars(next); saveStars(next).catch(() => {});
  };

  const matches = useMemo(() => {
    if (!pages || query.trim().length < 2) return [];
    const q = query.toLowerCase();
    return pages.map((t, i) => ({ i, t })).filter((p) => p.t.toLowerCase().includes(q));
  }, [pages, query]);

  if (pages === null) {
    return <Screen><ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} /></Screen>;
  }

  // Empty state — no text loaded yet.
  if (pages.length === 0) {
    return (
      <Screen>
        <ScreenTitle title="Big Book reader" subtitle="Read, search, and bookmark passages" />
        <Card>
          <Text style={typography.body}>Add your own copy of the text to start reading.</Text>
          <Text style={[typography.caption, { marginTop: spacing.sm, marginBottom: spacing.md }]}>
            This app doesn’t include the book itself. Paste in a public-domain edition (the first edition of
            Alcoholics Anonymous is in the public domain) and it’s saved on your device. Tip: separate pages with a
            line of three dashes (---) for exact page breaks, or just paste the whole text and we’ll split it for you.
          </Text>
          <Button title="📖 Add the text" onPress={() => setImportOpen(true)} />
        </Card>
        <ImportModal visible={importOpen} draft={draft} setDraft={setDraft} busy={busy} onSave={doImport} onClose={() => setImportOpen(false)} />
      </Screen>
    );
  }

  const page = pages[index];
  const starred = stars.includes(index);

  return (
    <Screen>
      <ScreenTitle title="Big Book reader" subtitle={`Page ${index + 1} of ${pages.length}`} />

      {/* Search */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={(t) => { setQuery(t); setSearching(t.trim().length >= 2); }}
          placeholder="Search passages…"
          placeholderTextColor={colors.textMuted}
        />
        <TouchableOpacity onPress={() => { setShowStars((v) => !v); setSearching(false); setQuery(''); }} style={styles.starBtn}>
          <Text style={{ fontSize: 18 }}>{showStars ? '📖' : '⭐'}</Text>
        </TouchableOpacity>
      </View>

      {searching ? (
        <Card>
          <Text style={[typography.caption, { marginBottom: spacing.xs }]}>{matches.length} result{matches.length === 1 ? '' : 's'}</Text>
          {matches.slice(0, 40).map((m) => (
            <TouchableOpacity key={m.i} style={styles.resultRow} onPress={() => { setIndex(m.i); setSearching(false); setQuery(''); setShowStars(false); }}>
              <Text style={[typography.caption, { color: colors.primary, fontWeight: '700' }]}>Page {m.i + 1}</Text>
              <Text style={typography.caption} numberOfLines={2}>{snippet(m.t, query)}</Text>
            </TouchableOpacity>
          ))}
          {matches.length === 0 ? <Text style={typography.bodySecondary}>No matches.</Text> : null}
        </Card>
      ) : showStars ? (
        <Card>
          <Text style={[typography.caption, { marginBottom: spacing.xs }]}>Bookmarked pages</Text>
          {stars.length === 0 ? (
            <Text style={typography.bodySecondary}>No bookmarks yet. Tap the ⭐ while reading a page to bookmark it.</Text>
          ) : stars.map((i) => (
            <TouchableOpacity key={i} style={styles.resultRow} onPress={() => { setIndex(i); setShowStars(false); }}>
              <Text style={[typography.caption, { color: colors.primary, fontWeight: '700' }]}>Page {i + 1}</Text>
              <Text style={typography.caption} numberOfLines={1}>{pages[i]?.slice(0, 80)}</Text>
            </TouchableOpacity>
          ))}
        </Card>
      ) : (
        <>
          <Card>
            <View style={styles.pageHead}>
              <Text style={[typography.caption, { color: colors.textMuted }]}>Page {index + 1}</Text>
              <TouchableOpacity onPress={() => toggleStar(index)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={{ fontSize: 20 }}>{starred ? '⭐' : '☆'}</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.pageScroll} showsVerticalScrollIndicator>
              <Text style={styles.pageText}>{page}</Text>
            </ScrollView>
          </Card>

          <View style={styles.nav}>
            <Button title="‹ Previous" variant="secondary" onPress={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0} />
            <View style={{ width: spacing.sm }} />
            <Button title="Next ›" variant="secondary" onPress={() => setIndex((i) => Math.min(pages.length - 1, i + 1))} disabled={index >= pages.length - 1} />
          </View>

          <TouchableOpacity onPress={replaceText} style={{ alignItems: 'center', paddingVertical: spacing.md }}>
            <Text style={typography.caption}>Replace the text</Text>
          </TouchableOpacity>
        </>
      )}

      <ImportModal visible={importOpen} draft={draft} setDraft={setDraft} busy={busy} onSave={doImport} onClose={() => setImportOpen(false)} />
    </Screen>
  );
}

function ImportModal({ visible, draft, setDraft, busy, onSave, onClose }: {
  visible: boolean; draft: string; setDraft: (s: string) => void; busy: boolean; onSave: () => void; onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <Text style={typography.h3}>Paste the text</Text>
          <Text style={[typography.caption, { marginVertical: spacing.sm }]}>
            Paste a public-domain edition. Use a line of three dashes (---) between pages for exact breaks, or paste it
            all and we’ll split it automatically.
          </Text>
          <TextInput
            style={styles.bigInput}
            value={draft}
            onChangeText={setDraft}
            placeholder="Paste here…"
            placeholderTextColor={colors.textMuted}
            multiline
            textAlignVertical="top"
          />
          <Button title={busy ? 'Saving…' : 'Save & read'} onPress={onSave} disabled={busy || !draft.trim()} />
          <TouchableOpacity onPress={onClose} style={{ alignItems: 'center', paddingVertical: spacing.sm }}>
            <Text style={{ color: colors.textSecondary }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

/** A short snippet of text around the first match of `q`. */
function snippet(text: string, q: string): string {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text.slice(0, 90);
  const start = Math.max(0, i - 30);
  return (start > 0 ? '…' : '') + text.slice(start, i + q.length + 50).replace(/\n/g, ' ') + '…';
}

const styles = StyleSheet.create({
  searchRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  search: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, fontSize: 15, color: colors.textPrimary, borderWidth: 1, borderColor: colors.border },
  starBtn: { marginLeft: spacing.sm, padding: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  resultRow: { paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider },
  pageHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  pageScroll: { maxHeight: 460 },
  pageText: { fontSize: 17, lineHeight: 27, color: colors.textPrimary },
  nav: { flexDirection: 'row', marginTop: spacing.sm },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, paddingBottom: spacing.xl },
  bigInput: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, fontSize: 15, color: colors.textPrimary, height: 220, marginBottom: spacing.md },
});
