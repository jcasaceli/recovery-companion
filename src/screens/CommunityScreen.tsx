import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Screen, ScreenTitle, Card, Button } from '../components/ui';
import { colors, spacing, radius, typography } from '../theme';
import { useAppState } from '../state/store';
import { formatDateTime } from '../utils/format';

export function CommunityScreen() {
  const { communityAccess, posts, addPost, togglePostLike } = useAppState();
  const [text, setText] = useState('');
  const [imageUri, setImageUri] = useState<string | undefined>();

  if (!communityAccess) {
    return (
      <Screen>
        <ScreenTitle title="Community" />
        <Card style={styles.locked}>
          <Text style={styles.lockEmoji}>🔒</Text>
          <Text style={typography.h3}>Community access is off</Text>
          <Text style={[typography.bodySecondary, { textAlign: 'center', marginTop: spacing.sm }]}>
            Your facilitator manages access to the community feed. Some programs
            limit photo sharing during treatment. They can turn this on for you
            when it's appropriate.
          </Text>
        </Card>
      </Screen>
    );
  }

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
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
      <ScreenTitle title="Community" subtitle="Share your journey, support others" />

      <Card>
        <TextInput
          style={styles.input}
          placeholder="Share something about your journey…"
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
          {p.text ? <Text style={[typography.body, { marginBottom: spacing.sm }]}>{p.text}</Text> : null}
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
  locked: { alignItems: 'center', paddingVertical: spacing.xl },
  lockEmoji: { fontSize: 44, marginBottom: spacing.sm },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 60,
    textAlignVertical: 'top',
    fontSize: 15,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  preview: { width: '100%', height: 160, borderRadius: radius.md, marginBottom: spacing.sm },
  composerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  photoBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2, backgroundColor: colors.surfaceAlt, borderRadius: radius.md },
  photoBtnText: { color: colors.textSecondary, fontWeight: '600', fontSize: 13 },
  postHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm },
  avatarText: { color: colors.textInverse, fontWeight: '700' },
  author: { ...typography.body, fontWeight: '600' },
  postImage: { width: '100%', height: 220, borderRadius: radius.md, marginBottom: spacing.sm },
  like: { alignSelf: 'flex-start' },
  likeText: { fontSize: 15, color: colors.textSecondary },
});
