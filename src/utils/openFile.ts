import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

// Open a file/URL that first needs an async fetch (e.g. a signed Storage URL)
// WITHOUT getting popup-blocked on web. Browsers block window.open() that runs
// after an await (the user-activation from the click is gone), so on web we open
// a blank tab synchronously — inside the click — and point it at the URL once
// resolved. Native opens the in-app browser. `onError` runs if it can't resolve.
export async function openResolvedUrl(
  resolve: () => Promise<string | null | undefined>,
  onError?: () => void,
): Promise<void> {
  if (Platform.OS === 'web') {
    const g: any = globalThis;
    const win = typeof g.open === 'function' ? g.open('', '_blank') : null;
    try {
      const url = await resolve();
      if (!url) { if (win) win.close(); onError?.(); return; }
      if (win) win.location.href = url;
      else g.open(url, '_blank');
    } catch {
      if (win) win.close();
      onError?.();
    }
    return;
  }
  try {
    const url = await resolve();
    if (!url) { onError?.(); return; }
    await WebBrowser.openBrowserAsync(url);
  } catch {
    onError?.();
  }
}
