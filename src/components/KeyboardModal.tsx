import React from 'react';
import {
  Modal,
  View,
  ScrollView,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Keyboard,
  Platform,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { colors, spacing, radius } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Extra style for the white card (e.g. maxWidth / maxHeight). */
  cardStyle?: ViewStyle | ViewStyle[];
};

/**
 * A centered modal card that stays usable when the keyboard is open.
 *
 * Fixes the "keyboard trap" where the on-screen keypad covered the Save button
 * with no way to scroll or dismiss it:
 *  - KeyboardAvoidingView lifts the card above the keyboard (iOS).
 *  - The card lives inside a ScrollView with keyboardShouldPersistTaps="handled",
 *    so you can scroll to the button AND a single tap on it works even while the
 *    keyboard is showing (no need to dismiss first).
 *  - Tapping the dimmed backdrop dismisses the keyboard.
 *
 * Drop-in replacement for the old `<Modal><View backdrop><View modal>…` pattern.
 */
export function KeyboardModal({ visible, onClose, children, cardStyle }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View style={styles.backdrop}>
            <ScrollView
              contentContainerStyle={styles.scroll}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              {/* Inner catcher so taps inside the card don't dismiss the keyboard. */}
              <TouchableWithoutFeedback accessible={false} onPress={() => {}}>
                <View style={[styles.card, cardStyle as ViewStyle]}>{children}</View>
              </TouchableWithoutFeedback>
            </ScrollView>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: spacing.lg },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md },
});
