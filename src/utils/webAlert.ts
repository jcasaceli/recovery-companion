// react-native-web does NOT implement Alert.alert — it's a no-op that just logs
// a warning. That means every confirmation dialog and info alert across the app
// silently does nothing in the browser (buttons appear to "do nothing"). Patch
// Alert.alert on web to use the browser's native dialogs so it works everywhere.
//
// Import this once, as early as possible (top of App.tsx), before any screen
// can call Alert.alert.
import { Alert, Platform } from 'react-native';

if (Platform.OS === 'web') {
  const g: any = globalThis;
  (Alert as any).alert = (title?: string, message?: string, buttons?: any[]) => {
    const text = [title, message].filter(Boolean).join('\n\n');
    const btns = Array.isArray(buttons) ? buttons : [];

    // 0–1 buttons → plain info alert, then fire the button's handler (if any).
    if (btns.length <= 1) {
      if (g.alert) g.alert(text);
      btns[0]?.onPress?.();
      return;
    }

    // 2+ buttons → confirm(). OK runs the first non-cancel action; Cancel runs
    // the cancel button. (3-button alerts degrade to confirm/cancel on web.)
    const cancel = btns.find((b) => b?.style === 'cancel');
    const confirm = btns.find((b) => b?.style !== 'cancel') || btns[btns.length - 1];
    const ok = g.confirm ? g.confirm(text) : true;
    if (ok) confirm?.onPress?.();
    else cancel?.onPress?.();
  };
}
