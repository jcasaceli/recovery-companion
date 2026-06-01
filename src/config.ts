/**
 * App configuration.
 *
 * Set the backend URL via an Expo public env var so it can differ per
 * environment without code changes. In a `.env` file at the project root:
 *
 *   EXPO_PUBLIC_BACKEND_URL=http://192.168.1.50:8787
 *
 * (Use your Mac's LAN IP, not localhost — a phone can't resolve the Mac's
 * localhost. Restart `expo start` after changing env vars.)
 *
 * When unset, the assistant falls back to its built-in offline mock so the app
 * still runs end-to-end without a backend.
 */
export const BACKEND_URL: string | undefined =
  process.env.EXPO_PUBLIC_BACKEND_URL || undefined;
