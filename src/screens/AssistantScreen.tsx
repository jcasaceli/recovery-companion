import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, radius, typography } from '../theme';
import { ChatMessage } from '../types';
import { CrisisResources } from '../components/CrisisResources';
import {
  sendToAssistant,
  ASSISTANT_GREETING,
} from '../services/assistant';

let mid = 0;
const nextId = () => `chat-${Date.now()}-${mid++}`;

const greeting: ChatMessage = {
  id: 'greeting',
  role: 'assistant',
  text: ASSISTANT_GREETING,
  timestamp: new Date().toISOString(),
};

export function AssistantScreen() {
  const [messages, setMessages] = useState<ChatMessage[]>([greeting]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const scrollToEnd = () =>
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;

    const userMsg: ChatMessage = {
      id: nextId(),
      role: 'user',
      text,
      timestamp: new Date().toISOString(),
    };
    const history = messages.filter((m) => m.id !== 'greeting');
    setMessages((m) => [...m, userMsg]);
    setDraft('');
    setSending(true);
    scrollToEnd();

    try {
      const reply = await sendToAssistant(history, text);
      const assistantMsg: ChatMessage = {
        id: nextId(),
        role: 'assistant',
        text: reply.text,
        timestamp: new Date().toISOString(),
        crisisFlagged: reply.crisisFlagged,
      };
      setMessages((m) => [...m, assistantMsg]);
    } finally {
      setSending(false);
      scrollToEnd();
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      {/* Disclosure banner — always visible, never hidden */}
      <View style={styles.disclosure}>
        <Text style={styles.disclosureText}>
          💬 Companion is an AI assistant — not a doctor or counselor. For
          clinical questions, message your care team.
        </Text>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.messages}
          onContentSizeChange={scrollToEnd}
        >
          {messages.map((m) => (
            <View key={m.id}>
              <View
                style={[
                  styles.bubble,
                  m.role === 'user' ? styles.bubbleUser : styles.bubbleAssistant,
                ]}
              >
                <Text
                  style={[
                    styles.bubbleText,
                    m.role === 'user' ? styles.bubbleTextUser : null,
                  ]}
                >
                  {m.text}
                </Text>
              </View>
              {m.crisisFlagged ? <CrisisResources compact /> : null}
            </View>
          ))}
          {sending ? (
            <View style={[styles.bubble, styles.bubbleAssistant, styles.typing]}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.typingText}>Companion is thinking…</Text>
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            placeholder="Type a message…"
            placeholderTextColor={colors.textMuted}
            value={draft}
            onChangeText={setDraft}
            multiline
          />
          <TouchableOpacity
            style={[styles.sendBtn, !draft.trim() ? styles.sendBtnDisabled : null]}
            onPress={send}
            disabled={!draft.trim() || sending}
          >
            <Text style={styles.sendBtnText}>Send</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  disclosure: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  disclosureText: { fontSize: 12, color: colors.primaryDark, lineHeight: 16 },
  messages: { padding: spacing.md, paddingBottom: spacing.lg },
  bubble: {
    maxWidth: '85%',
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  bubbleUser: {
    backgroundColor: colors.primary,
    alignSelf: 'flex-end',
    borderBottomRightRadius: radius.sm,
  },
  bubbleAssistant: {
    backgroundColor: colors.surface,
    alignSelf: 'flex-start',
    borderBottomLeftRadius: radius.sm,
  },
  bubbleText: { ...typography.body, lineHeight: 22 },
  bubbleTextUser: { color: colors.textInverse },
  typing: { flexDirection: 'row', alignItems: 'center' },
  typingText: { marginLeft: spacing.sm, color: colors.textSecondary, fontSize: 14 },
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
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { color: colors.textInverse, fontWeight: '600', fontSize: 15 },
});
