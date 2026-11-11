export type SupabaseIdentity = {
  email: string | null;
  id: string;
  name: string | null;
};

type AuthBridgeEnvironment = {
  SUPABASE_PUBLISHABLE_KEY?: string;
  SUPABASE_URL?: string;
};

type AuthResult =
  | { identity: SupabaseIdentity; ok: true }
  | { code: 'auth_bridge_unconfigured' | 'unauthorized'; ok: false; status: 401 | 503 };

/**
 * Temporary migration bridge. It asks Supabase Auth to validate the caller's
 * existing access token; the Worker never trusts or parses that token itself.
 * Remove this once customer authentication moves to the selected provider.
 */
export async function authenticateSupabase(request: Request, env: AuthBridgeEnvironment): Promise<AuthResult> {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return { code: 'unauthorized', ok: false, status: 401 };
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) return { code: 'auth_bridge_unconfigured', ok: false, status: 503 };

  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, authorization },
  });
  if (!response.ok) return { code: 'unauthorized', ok: false, status: 401 };

  const user = await response.json() as { email?: string; id: string; user_metadata?: { full_name?: string; name?: string } };
  return {
    identity: {
      email: user.email?.toLowerCase() ?? null,
      id: user.id,
      name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? null,
    },
    ok: true,
  };
}
