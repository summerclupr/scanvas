/**
 * Confirmations and notices that work in a browser.
 *
 * React Native's `Alert.alert` is an empty function in react-native-web, so
 * every button that asked for confirmation - Erase everything, Remove
 * document - silently did nothing on the web build, and "Test connection"
 * showed no result. In a browser these use the native `window.confirm` /
 * `window.alert`; elsewhere they use Alert.
 */

import { Alert, Platform } from 'react-native';

export function confirm(
  title: string,
  message: string,
  opts: { confirmLabel?: string; destructive?: boolean } = {},
): Promise<boolean> {
  const label = opts.confirmLabel ?? 'OK';
  if (Platform.OS === 'web') {
    return Promise.resolve(
      typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`),
    );
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: label, style: opts.destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ]);
  });
}

export function notice(title: string, message: string): void {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}
