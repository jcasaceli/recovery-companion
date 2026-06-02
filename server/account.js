/**
 * Account deletion. Apple requires any app with sign-up to let users delete
 * their account + data from within the app. The service_role key (admin) is
 * required to delete an auth user, so this must run server-side.
 *
 * Deleting auth.users cascades to profiles and org_members (ON DELETE CASCADE).
 * Records that only SET NULL on profile/org delete (individuals, organizations)
 * are cleaned up explicitly here first.
 */
import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    : null;

async function getUser(req) {
  if (!supabaseAdmin) return null;
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error) return null;
  return data.user;
}

export const accountRouter = Router();

accountRouter.post('/delete', async (req, res) => {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Server missing SUPABASE_SERVICE_ROLE_KEY.' });
  }
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated.' });

  try {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (profile?.role === 'facilitator') {
      // A facilitator owns their sober living: delete its residents (cascades
      // payments/notes/check-ins/etc. via individual_id) and the org itself.
      const { data: orgs } = await supabaseAdmin
        .from('organizations')
        .select('id')
        .eq('created_by', user.id);
      for (const o of orgs ?? []) {
        await supabaseAdmin.from('individuals').delete().eq('org_id', o.id);
        await supabaseAdmin.from('organizations').delete().eq('id', o.id);
      }
    } else {
      // A member: delete their own resident record (cascades their data).
      await supabaseAdmin.from('individuals').delete().eq('profile_id', user.id);
    }

    // Remove the auth user last — cascades profile + org_members.
    const { error } = await supabaseAdmin.auth.admin.deleteUser(user.id);
    if (error) throw error;

    res.json({ ok: true });
  } catch (e) {
    console.error('[account] delete', e);
    res.status(500).json({ error: e.message });
  }
});
