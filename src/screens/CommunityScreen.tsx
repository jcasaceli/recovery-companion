import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Image, Switch, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import { Screen, ScreenTitle, Card, Button } from '../components/ui';
import { colors, spacing, radius, typography } from '../theme';
import { useAppState } from '../state/store';
import { formatDateTime } from '../utils/format';
import { setCommunityNotify, reportPost } from '../services/db';

const NOTIFY_KEY = 'community-notify';
const BLOCKED_KEY = 'community-blocked';

/** Renders post text with @mentions highlighted. */
function PostText({ text }: { text: string }) {
  const parts = text.split(/(@[\w.]+)/g);
  return (
    <Text style={[typography.body, { marginBottom: spacing.sm }]}>
      {parts.map((p, i) =>
        p.startsWith('@') ? (
          <Text key={i} style={styles.mention}>{p}</Text>
        ) : (
          <Text key={i}>{p}</Text>
        ),
      )}
    </Text>
  );
}

export function CommunityScreen() {
  const { posts, addPost, togglePostLike } = useAppState();
  const [text, setText] = useState('');
  const [imageUri, setImageUri] = useState<string | undefined>();
  const [notify, setNotify] = useState(false);
  const [blocked, setBlocked] = useState<Set<string>>(new Set());

  useEffect(() => {
    AsyncStorage.getItem(NOTIFY_KEY).then((v) => setNotify(v === '1')).catch(() => {});
    AsyncStorage.getItem(BLOCKED_KEY).then((v) => { if (v) setBlocked(new Set(JSON.parse(v))); }).catch(() => {});
  }, []);

  const persistBlocked = (s: Set<string>) => {
    setBlocked(new Set(s));
    AsyncStorage.setItem(BLOCKED_KEY, JSON.stringify([...s])).catch(() => {});
  };

  const moderate = (post: { id: string; authorId?: string; authorName: string }) => {
    Alert.alert('Post options', undefined, [
      {
        text: 'Report post',
        onPress: () => {
          reportPost(post.id).catch(() => {});
          Alert.alert('Reported', 'Thanks. Our team reviews reported content within 24 hours.');
        },
      },
      {
        text: `Block ${post.authorName}`,
        style: 'destructive',
        onPress: () => {
          if (post.authorId) { const s = new Set(blocked); s.add(post.authorId); persistBlocked(s); }
          else Alert.alert("Can't block", 'This is sample content.');
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const toggleNotify = async (v: boolean) => {
    setNotify(v);
    AsyncStorage.setItem(NOTIFY_KEY, v ? '1' : '0').catch(() => {});
    setCommunityNotify(v).catch(() => {}); // server uses this to fan out posts
    if (v) {
      // Make sure we have permission so new-post alerts can be delivered.
      await Notifications.requestPermissionsAsync().catch(() => {});
    }
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (!result.canceled && result.assets[0]) setImageUri(result.assets[0].uri);
  };

  const submit = () => {
    if (!text.trim() && !imageUri) return;
    addPost(text, imageUri);
    setText('');
    setImageUri(undefined);
  };

  return (
    <Screen>
      <ScreenTitle title="Community" subtitle="Share your journey & support each other" />

      <Text style={styles.guidelines}>
        Be respectful. Harassment, hate, and other objectionable content aren't allowed.
        Tap ⋯ on any post to report it or block the person.
      </Text>

      <Card style={styles.notifyRow}>
        <View style={{ flex: 1 }}>
          <Text style={typography.body}>🔔 Notify me of new posts</Text>
          <Text style={typography.caption}>Get alerted when someone posts in the community.</Text>
        </View>
        <Switch value={notify} onValueChange={toggleNotify} trackColor={{ true: colors.primary }} />
      </Card>

      <Card>
        <TextInput
          style={styles.input}
          placeholder="Share something… use @name to tag someone"
          placeholderTextColor={colors.textMuted}
          value={text}
          onChangeText={setText}
          multiline
        />
        {imageUri ? <Image source={{ uri: imageUri }} style={styles.preview} /> : null}
        <View style={styles.composerActions}>
          <TouchableOpacity onPress={pickImage} style={styles.photoBtn}>
            <Text style={styles.photoBtnText}>{imageUri ? '✓ Photo added' : '📷 Add photo'}</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Button title="Post" onPress={submit} disabled={!text.trim() && !imageUri} />
          </View>
        </View>
      </Card>

      {posts.filter((p) => !(p.authorId && blocked.has(p.authorId))).map((p) => (
        <Card key={p.id}>
          <View style={styles.postHeader}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{p.authorName.charAt(0)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.author}>{p.authorName}</Text>
              <Text style={typography.caption}>{formatDateTime(p.createdAt)}</Text>
            </View>
            <TouchableOpacity onPress={() => moderate(p)} hitSlop={10} style={styles.moreBtn}>
              <Text style={styles.moreText}>⋯</Text>
            </TouchableOpacity>
          </View>
          {p.text ? <PostText text={p.text} /> : null}
          {p.imageUri ? <Image source={{ uri: p.imageUri }} style={styles.postImage} /> : null}
          <TouchableOpacity onPress={() => togglePostLike(p.id)} style={styles.like}>
            <Text style={styles.likeText}>{p.likedByMe ? '❤️' : '🤍'} {p.likes}</Text>
          </TouchableOpacity>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  guidelines: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.sm },
  moreBtn: { paddingHorizontal: spacing.sm },
  moreText: { fontSize: 22, color: colors.textMuted, fontWeight: '700' },
  notifyRow: { flexDirection: 'row', alignItems: 'center' },
  input: {
    backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md,
    minHeight: 60, textAlignVertical: 'top', fontSize: 15, color: colors.textPrimary, marginBottom: spacing.sm,
  },
  preview: { width: '100%', height: 160, borderRadius: radius.md, marginBottom: spacing.sm },
  composerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  photoBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2, backgroundColor: colors.surfaceAlt, borderRadius: radius.md },
  photoBtnText: { color: colors.textSecondary, fontWeight: '600', fontSize: 13 },
  postHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm },
  avatarText: { color: colors.textInverse, fontWeight: '700' },
  author: { ...typography.body, fontWeight: '600' },
  mention: { color: colors.primary, fontWeight: '700' },
  postImage: { width: '100%', height: 220, borderRadius: radius.md, marginBottom: spacing.sm },
  like: { alignSelf: 'flex-start' },
  likeText: { fontSize: 15, color: colors.textSecondary },
});
