import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TextInput, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Screen, ScreenTitle, Card, SectionTitle, Button } from '../components/ui';
import { colors, spacing, radius, typography } from '../theme';
import { useAuth } from '../state/auth';
import {
  getCareTeam, listAnnouncements, postAnnouncement, deleteAnnouncement,
  getMyOrg, CareTeamMember, Announcement,
} from '../services/db';
import { formatDateTime } from '../utils/format';

export function MessagesScreen() {
  const auth = useAuth();
  const isStaff = auth.profile?.role === 'facilitator'; // facilitator (admin) or house manager

  const [team, setTeam] = useState<CareTeamMember[]>([]);
  const [posts, setPosts] = useState<Announcement[]>([]);
  const [org, setOrg] = useState<{ id: string; name?: string } | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    getCareTeam().then(setTeam).catch(() => {});
    listAnnouncements().then(setPosts).catch(() => {});
    if (isStaff) getMyOrg().then((o: any) => o && setOrg({ id: o.id, name: o.name })).catch(() => {});
  }, [isStaff]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const send = async () => {
    const body = draft.trim();
    if (!body || !org) return;
    setBusy(true);
    try {
      await postAnnouncement(org.id, body, auth.profile?.fullName ?? undefined);
      setDraft('');
      listAnnouncements().then(setPosts).catch(() => {});
    } catch (e: any) {
      Alert.alert('Could not send', e?.message ?? 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const remove = (a: Announcement) => {
    Alert.alert('Delete message?', 'This removes it for everyone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await deleteAnnouncement(a.id).catch(() => {}); listAnnouncements().then(setPosts).catch(() => {}); } },
    ]);
  };

  return (
    <Screen>
      <ScreenTitle
        title="Messages"
        subtitle={isStaff ? `Message everyone in ${org?.name || 'your sober living'}` : 'Your care team'}
      />

      {/* Care team */}
      <Card>
        <Text style={[typography.body, { fontWeight: '700', marginBottom: spacing.sm }]}>👥 Your care team</Text>
        {team.length === 0 ? (
          <Text style={typography.bodySecondary}>No care team yet.</Text>
        ) : (
          team.map((m, i) => (
            <View key={i} style={styles.teamRow}>
              <View style={styles.avatar}><Text style={styles.avatarText}>{m.name.charAt(0).toUpperCase()}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={typography.body}>{m.name}</Text>
                <Text style={typography.caption}>{m.role}</Text>
              </View>
            </View>
          ))
        )}
      </Card>

      {/* Staff: compose a broadcast */}
      {isStaff ? (
        <Card>
          <Text style={[typography.body, { fontWeight: '600' }]}>Send a message to everyone</Text>
          <Text style={[typography.caption, { marginTop: 2, marginBottom: spacing.sm }]}>
            All residents in your sober living will see this. Residents can read but can't reply.
          </Text>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder="Write an announcement…"
            placeholderTextColor={colors.textMuted}
            multiline
          />
          <Button title={busy ? 'Sending…' : 'Send to everyone'} onPress={send} disabled={busy || !draft.trim()} />
        </Card>
      ) : null}

      <SectionTitle>{isStaff ? 'Sent messages' : 'Messages from your care team'}</SectionTitle>
      {posts.length === 0 ? (
        <Card>
          <Text style={typography.bodySecondary}>
            {isStaff ? 'No messages yet. Send your first announcement above.' : 'No messages yet. Updates from your care team will appear here.'}
          </Text>
        </Card>
      ) : (
        posts.map((a) => (
          <Card key={a.id} onLongPress={isStaff ? () => remove(a) : undefined}>
            <Text style={typography.body}>{a.body}</Text>
            <Text style={[typography.caption, { marginTop: spacing.xs }]}>
              {a.authorName ? `${a.authorName} · ` : ''}{formatDateTime(a.createdAt)}
            </Text>
          </Card>
        ))
      )}

      {!isStaff ? (
        <Text style={styles.note}>Only your care team can post here. In an emergency, call 911 or 988.</Text>
      ) : (
        <Text style={styles.note}>Long-press a sent message to delete it.</Text>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  teamRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.xs },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md },
  avatarText: { color: colors.textInverse, fontWeight: '700' },
  input: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, fontSize: 15, color: colors.textPrimary, minHeight: 70, textAlignVertical: 'top', marginBottom: spacing.sm },
  note: { fontSize: 12, color: colors.textMuted, textAlign: 'center', marginTop: spacing.md },
});
