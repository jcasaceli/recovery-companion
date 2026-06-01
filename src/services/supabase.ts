/**
 * Supabase client (opt-in).
 *
 * The prototype runs entirely on the local AsyncStorage store. This module is
 * the integration point for moving to a real cloud backend with auth + Row-
 * Level Security. It stays dormant until you set:
 *
 *   EXPO_PUBLIC_SUPABASE_URL=...
 *   EXPO_PUBLIC_SUPABASE_ANON_KEY=...
 *
 * Apply supabase/migrations/0001_init.sql to your project first (it creates the
 * schema + RLS). Then swap the internals of src/state/store.tsx to read/write
 * through `supabase` instead of AsyncStorage — the screens won't change because
 * they depend only on the useAppState() contract. See docs/BACKEND.md.
 *
 * Compliance: Supabase offers a BAA on paid plans. Do not put real PHI here
 * until that's signed and RLS is verified. See docs/COMPLIANCE.md.
 */

import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url as string, anonKey as string, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        // React Native has no URL bar; disable URL-based session detection.
        detectSessionInUrl: false,
      },
    })
  : null;
