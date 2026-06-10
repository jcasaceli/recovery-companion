import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Screen, ScreenTitle, Card, SectionTitle, Button } from '../components/ui';
import { colors, spacing, radius, typography } from '../theme';
import { formatDate } from '../utils/format';

/**
 * Nightly Review — based on the nightly inventory ("When We Retire at Night")
 * from the AA Big Book, p. 86. Private to the member and stored on-device only;
 * it is never shared with the facilitator.
 */

const YESNO = [
  { key: 'resentful', q: 'Was I resentful today?' },
  { key: 'selfish', q: 'Was I selfish?' },
  { key: 'dishonest', q: 'Was I dishonest?' },
  { key: 'afraid', q: 'Was I afraid?' },
] as const;

const REFLECT = [
  { key: 'apology', q: 'Do I owe anyone an apology?' },
  { key: 'discuss', q: 'Have I kept something to myself that I should discuss with someone?' },
  { key: 'kind', q: 'Was I kind and loving toward all?' },
  { key: 'better', q: 'What could I have done better?' },
  { key: 'others', q: 'Was I thinking of myself most of the time — or of what I could do for others?' },
] as const;

type Answers = Record<string, string>;
interface Review { date: string; savedAt: string; answers: Answers }

const STORE_KEY = 'nightly-reviews';
const todayStr = () => new Date().toISOString().slice(0, 10);

export function NightlyReviewScreen() {
  const [answers, setAnswers] = useState<Answers>({});
  const [history, setHistory] = useState<Review[]>([]);
  const [savedToday, setSavedToday] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(STORE_KEY).then((raw) => {
      const list: Review[] = raw ? JSON.parse(raw) : [];
      setHistory(list);
      const today = list.find((r) => r.date === todayStr());
      if (today) { setAnswers(today.answers); setSavedToday(true); }
    }).catch(() => {});
  }, []);

  const set = (k: string, v: string) => { setAnswers((a) => ({ ...a, [k]: v })); setSavedToday(false); };

  const save = async () => {
    const entry: Review = { date: todayStr(), savedAt: new Date().toISOString(), answers };
    const next = [entry, ...history.filter((r) => r.date !== entry.date)];
    setHistory(next);
    setSavedToday(true);
    try { await AsyncStorage.setItem(STORE_KEY, JSON.stringify(next.slice(0, 90))); } catch {}
    Alert.alert('Saved 🌙', 'Tonight’s review is saved. Rest well.');
  };

  const answered = YESNO.filter((y) => answers[y.key]).length + REFLECT.filter((r) => (answers[r.key] || '').trim()).length;

  return (
    <Screen>
      <ScreenTitle title="Nightly Review" subtitle={formatDate(todayStr())} />

      <Card style={styles.quoteCard}>
        <Text style={styles.quote}>
          “When we retire at night, we constructively review our day.”
        </Text>
        <Text style={styles.attrib}>— Alcoholics Anonymous, p. 86</Text>
        <Text style={[typography.caption, { marginTop: spacing.sm }]}>
          A few honest minutes before bed. This is just for you — it’s private and never shared.
        </Text>
      </Card>

      <SectionTitle>Looking back on today</SectionTitle>
      <Card>
        {YESNO.map((y) => (
          <View key={y.key} style={styles.ynRow}>
            <Text style={[typography.body, { flex: 1 }]}>{y.q}</Text>
            <View style={styles.ynBtns}>
              {(['Yes', 'No'] as const).map((opt) => {
                const active = answers[y.key] === opt;
                return (
                  <TouchableOpacity
                    key={opt}
                    onPress={() => set(y.key, active ? '' : opt)}
                    style={[styles.ynBtn, active ? (opt === 'No' ? styles.ynGood : styles.ynBad) : null]}
                  >
                    <Text style={[styles.ynText, active ? { color: colors.textInverse } : null]}>{opt}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}
      </Card>

      <SectionTitle>Reflect</SectionTitle>
      {REFLECT.map((r) => (
        <Card key={r.key}>
          <Text style={[typography.body, { fontWeight: '600', marginBottom: spacing.sm }]}>{r.q}</Text>
          <TextInput
            style={styles.input}
            value={answers[r.key] || ''}
            onChangeText={(t) => set(r.key, t)}
            placeholder="Write a few words…"
            placeholderTextColor={colors.textMuted}
            multiline
          />
        </Card>
      ))}

      <Button title={savedToday ? 'Saved 🌙 — update tonight’s review' : 'Save tonight’s review'} onPress={save} disabled={answered === 0} />

      {history.length ? (
        <>
          <SectionTitle>Past reviews</SectionTitle>
          {history.map((r) => {
            const open = expanded === r.date;
            return (
              <Card key={r.date} onPress={() => setExpanded(open ? null : r.date)}>
                <Text style={[typography.body, { fontWeight: '600' }]}>
                  {formatDate(r.date)} {r.date === todayStr() ? '· tonight' : ''}
                </Text>
                {open ? (
                  <View style={{ marginTop: spacing.sm }}>
                    {YESNO.map((y) => answers && r.answers[y.key] ? (
                      <Text key={y.key} style={typography.caption}>{y.q} — {r.answers[y.key]}</Text>
                    ) : null)}
                    {REFLECT.map((q) => (r.answers[q.key] || '').trim() ? (
                      <View key={q.key} style={{ marginTop: spacing.xs }}>
                        <Text style={[typography.caption, { fontWeight: '700' }]}>{q.q}</Text>
                        <Text style={typography.caption}>{r.answers[q.key]}</Text>
                      </View>
                    ) : null)}
                  </View>
                ) : (
                  <Text style={typography.caption}>Tap to view</Text>
                )}
              </Card>
            );
          })}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  quoteCard: { backgroundColor: colors.surfaceAlt },
  quote: { ...typography.h3, fontStyle: 'italic', color: colors.primaryDark },
  attrib: { ...typography.caption, marginTop: spacing.xs },
  ynRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.divider },
  ynBtns: { flexDirection: 'row', gap: spacing.xs },
  ynBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, minWidth: 52, alignItems: 'center' },
  ynGood: { backgroundColor: colors.success },
  ynBad: { backgroundColor: colors.warning },
  ynText: { fontWeight: '700', color: colors.textSecondary },
  input: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, fontSize: 15, color: colors.textPrimary, minHeight: 60, textAlignVertical: 'top' },
});
