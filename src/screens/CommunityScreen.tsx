import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Image, Switch } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import { Screen, ScreenTitle, Card, Button } from '../components/ui';
import { colors, spacing, radius, typography } from '../theme';
import { useAppState } from '../state/store';
import { formatDateTime } from '../utils/format';
import { setCommunityNotify } from '../services/db';

const NOTIFY_KEY = 'community-notify';

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

  useEffect(() => {
    AsyncStorage.getItem(NOTIFY_KEY).then((v) => setNotify(v === '1')).catch(() => {});
  }, []);

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

      {posts.map((p) => (
        <Card key={p.id}>
          <View style={styles.postHeader}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{p.authorName.charAt(0)}</Text>
            </View>
            <View>
              <Text style={styles.author}>{p.authorName}</Text>
              <Text style={typography.caption}>{formatDateTime(p.createdAt)}</Text>
            </View>
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
