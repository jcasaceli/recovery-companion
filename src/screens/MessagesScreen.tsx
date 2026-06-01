import React, { useRef, useState, useLayoutEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Screen, ScreenTitle, Card } from '../components/ui';
import { colors, spacing, radius, typography } from '../theme';
import { useAppState } from '../state/store';
import { formatDateTime } from '../utils/format';

const Stack = createNativeStackNavigator();

export function MessagesScreen() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerShadowVisible: false,
        headerTintColor: colors.primary,
        headerTitleStyle: { color: colors.textPrimary },
      }}
    >
      <Stack.Screen
        name="ThreadList"
        component={ThreadListScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Conversation"
        component={ConversationScreen}
        options={{ title: '' }}
      />
    </Stack.Navigator>
  );
}

function ThreadListScreen() {
  const nav = useNavigation<any>();
  const { threads } = useAppState();

  return (
    <Screen>
      <ScreenTitle title="Messages" subtitle="Your loved one's care team" />
      {threads.length === 0 ? (
        <Card>
          <Text style={typography.h3}>No care team yet</Text>
          <Text style={[typography.bodySecondary, { marginTop: 4 }]}>
            Once your loved one's providers are connected, you'll be able to message
            them here. In the meantime, the Resources tab has support lines you can
            reach any time.
          </Text>
        </Card>
      ) : null}
      {threads.map((t) => {
        const last = t.messages[t.messages.length - 1];
        const unread = t.messages.some((m) => m.senderType === 'provider' && !m.read);
        return (
          <Card
            key={t.id}
            onPress={() => nav.navigate('Conversation', { threadId: t.id })}
            style={styles.threadCard}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{t.providerName.charAt(0)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.threadHeader}>
                <Text style={typography.h3}>{t.providerName}</Text>
                {unread ? <View style={styles.unreadDot} /> : null}
              </View>
              <Text style={typography.caption}>{t.providerRole}</Text>
              {last ? (
                <Text numberOfLines={1} style={[typography.bodySecondary, { marginTop: 4 }]}>
                  {last.senderType === 'parent' ? 'You: ' : ''}
                  {last.text}
                </Text>
              ) : null}
            </View>
          </Card>
        );
      })}

      <Text style={styles.note}>
        Messages are not monitored 24/7. In an emergency, call 911 or 988.
      </Text>
    </Screen>
  );
}

function ConversationScreen() {
  const route = useRoute<any>();
  const nav = useNavigation<any>();
  const { threadId } = route.params;
  const { threads, sendProviderMessage, markThreadRead } = useAppState();
  const thread = threads.find((t) => t.id === threadId);
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  useLayoutEffect(() => {
    if (thread) {
      nav.setOptions({ title: thread.providerName });
      markThreadRead(thread.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  if (!thread) {
    return (
      <Screen>
        <Text style={typography.body}>Conversation not found.</Text>
      </Screen>
    );
  }

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    sendProviderMessage(thread.id, text);
    setDraft('');
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
  };

  return (
    <SafeAreaView style={styles.convScreen} edges={['bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.convMessages}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          {thread.messages.map((m) => (
            <View
              key={m.id}
              style={[
                styles.msgBubble,
                m.senderType === 'parent' ? styles.msgUser : styles.msgProvider,
              ]}
            >
              <Text
                style={[
                  styles.msgText,
                  m.senderType === 'parent' ? { color: colors.textInverse } : null,
                ]}
              >
                {m.text}
              </Text>
              <Text
                style={[
                  styles.msgTime,
                  m.senderType === 'parent' ? { color: colors.primaryLight } : null,
                ]}
              >
                {formatDateTime(m.timestamp)}
              </Text>
            </View>
          ))}
        </ScrollView>

        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            placeholder={`Message ${thread.providerName}…`}
            placeholderTextColor={colors.textMuted}
            value={draft}
            onChangeText={setDraft}
            multiline
          />
          <TouchableOpacity
            style={[styles.sendBtn, !draft.trim() ? { opacity: 0.4 } : null]}
            onPress={send}
            disabled={!draft.trim()}
          >
            <Text style={styles.sendBtnText}>Send</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  threadCard: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  avatarText: { color: colors.textInverse, fontWeight: '700', fontSize: 18 },
  threadHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  unreadDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },
  note: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  convScreen: { flex: 1, backgroundColor: colors.background },
  convMessages: { padding: spacing.md },
  msgBubble: {
    maxWidth: '82%',
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  msgUser: {
    backgroundColor: colors.primary,
    alignSelf: 'flex-end',
    borderBottomRightRadius: radius.sm,
  },
  msgProvider: {
    backgroundColor: colors.surface,
    alignSelf: 'flex-start',
    borderBottomLeftRadius: radius.sm,
  },
  msgText: { ...typography.body, lineHeight: 21 },
  msgTime: { fontSize: 11, color: colors.textMuted, marginTop: 4 },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    maxHeight: 120,
    fontSize: 15,
    color: colors.textPrimary,
    marginRight: spacing.sm,
  },
  sendBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
  },
  sendBtnText: { color: colors.textInverse, fontWeight: '600', fontSize: 15 },
});
