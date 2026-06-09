/**
 * Auth layer. Active only when Supabase is configured.
 *
 * - Not configured  → status 'local'. The app runs the on-device prototype
 *   exactly as before (no login required).
 * - Configured      → status 'signedOut' | 'signedIn'. The app shows the auth
 *   screens until there's a session.
 *
 * Verification: email is handled by Supabase out of the box. SMS OTP requires
 * an SMS provider (Twilio) configured in Supabase Auth — until then the SMS
 * path surfaces an error (the documented stub boundary).
 */

import React, { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import { supabase, isSupabaseConfigured } from '../services/supabase';
import * as dbApi from '../services/db';
import { registerForPushNotificationsAsync } from '../services/push';
import { AppRole, Profile } from '../types';

let pushRegistered = false;
async function registerPush() {
  if (pushRegistered) return;
  try {
    const token = await registerForPushNotificationsAsync();
    if (token) {
      await dbApi.savePushToken(token, Platform.OS);
      pushRegistered = true;
    }
  } catch {
    /* best effort */
  }
}

type Status = 'local' | 'loading' | 'signedOut' | 'signedIn';

export interface SignUpInput {
  email: string;
  password: string;
  role: AppRole;
  fullName: string;
  phone?: string;
  verifyChannel: 'email' | 'sms';
  orgName?: string;
}

interface AuthContextValue {
  configured: boolean;
  status: Status;
  session: Session | null;
  profile: Profile | null;
  signUp: (input: SignUpInput) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  requestEmailOtp: (email: string) => Promise<void>;
  verifyEmailOtp: (email: string, token: string) => Promise<void>;
  requestSmsOtp: (phone: string) => Promise<void>;
  verifySmsOtp: (phone: string, token: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>(isSupabaseConfigured ? 'loading' : 'local');
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  const loadProfile = async (attempt = 0) => {
    try {
      const row: any = await dbApi.getMyProfile();
      if (row) {
        setProfile({
          id: row.id,
          role: row.role,
          fullName: row.full_name ?? undefined,
          email: row.email ?? undefined,
          phone: row.phone ?? undefined,
          emailVerified: row.email_verified ?? false,
          phoneVerified: row.phone_verified ?? false,
        });
        registerPush(); // save this device's push token for fan-out
        return;
      }
      // No profile row. Right after signup the trigger may lag a beat — retry
      // once. If it's still missing, the session is stale (e.g. the user was
      // deleted) — sign out so the app returns to the login screen.
      if (attempt < 1) {
        setTimeout(() => loadProfile(attempt + 1), 1200);
      } else {
        console.warn('[auth] no profile for session — signing out stale session');
        await dbApi.signOut();
      }
    } catch (e) {
      console.warn('[auth] loadProfile failed', e);
    }
  };

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    let cancelled = false;
    (async () => {
      // Cross-subdomain handoff: the marketing site (soberlivingcompanion.com)
      // signs the user in on its own origin, then redirects here with the
      // tokens in the URL hash. localStorage is per-origin, so we adopt that
      // session explicitly. Web only.
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location.hash.includes('access_token')) {
        try {
          const p = new URLSearchParams(window.location.hash.slice(1));
          const access_token = p.get('access_token');
          const refresh_token = p.get('refresh_token');
          if (access_token && refresh_token && supabase) {
            await supabase.auth.setSession({ access_token, refresh_token });
          }
        } catch (e) {
          console.warn('[auth] hash session adopt failed', e);
        }
        try { window.history.replaceState(null, '', window.location.pathname + window.location.search); } catch {}
      }
      const { data } = await supabase!.auth.getSession();
      if (cancelled) return;
      setSession(data.session);
      setStatus(data.session ? 'signedIn' : 'signedOut');
      if (data.session) loadProfile();
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setStatus(s ? 'signedIn' : 'signedOut');
      if (s) loadProfile();
      else setProfile(null);
    });
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      configured: isSupabaseConfigured,
      status,
      session,
      profile,
      signUp: async (input) => {
        await dbApi.signUp(input);
        if (input.verifyChannel === 'sms' && input.phone) {
          // Trigger SMS OTP (needs Twilio configured in Supabase Auth).
          await dbApi.requestSmsOtp(input.phone);
        }
      },
      signIn: (email, password) => dbApi.signInWithPassword(email, password).then(() => {}),
      requestEmailOtp: (email) => dbApi.requestEmailOtp(email),
      verifyEmailOtp: (email, token) => dbApi.verifyEmailOtp(email, token).then(() => {}),
      requestSmsOtp: (phone) => dbApi.requestSmsOtp(phone),
      verifySmsOtp: (phone, token) => dbApi.verifySmsOtp(phone, token).then(() => {}),
      signOut: () => dbApi.signOut(),
      refreshProfile: loadProfile,
    }),
    [status, session, profile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
