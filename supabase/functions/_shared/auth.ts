import { createClient, type SupabaseClient, type User } from 'supabase';

import { HttpError } from './http.ts';

export type AuthorizedContext = {
  admin: SupabaseClient;
  user: User;
  userClient: SupabaseClient;
};

function keyFromDictionary(environmentName: string) {
  const value = Deno.env.get(environmentName);
  if (!value) return null;

  try {
    const keys = JSON.parse(value) as Record<string, string>;
    return keys.default ?? Object.values(keys)[0] ?? null;
  } catch {
    return null;
  }
}

function requireEnvironment(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required Edge Function environment variable: ${name}`);
  return value;
}

export async function authorizeHouseholdAdministrator(request: Request): Promise<AuthorizedContext> {
  const authorization = request.headers.get('authorization');
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!authorization || !token) throw new HttpError(401, 'Sign in before using this function.', 'unauthorized');

  const supabaseUrl = requireEnvironment('SUPABASE_URL');
  const publishableKey =
    keyFromDictionary('SUPABASE_PUBLISHABLE_KEYS') ??
    Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ??
    Deno.env.get('SUPABASE_ANON_KEY');
  const secretKey =
    keyFromDictionary('SUPABASE_SECRET_KEYS') ??
    Deno.env.get('SUPABASE_SECRET_KEY') ??
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!publishableKey || !secretKey) throw new Error('Supabase Edge Function keys are unavailable.');

  const clientOptions = {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  };
  const userClient = createClient(supabaseUrl, publishableKey, {
    ...clientOptions,
    global: { headers: { Authorization: authorization } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser(token);
  if (userError || !userData.user) throw new HttpError(401, 'Your session is not valid.', 'unauthorized');

  const { data: roles, error: roleError } = await userClient
    .from('user_roles')
    .select('role')
    .eq('user_id', userData.user.id)
    .in('role', ['super_admin', 'registration_staff']);

  if (roleError) throw new Error(`Could not authorize the caller: ${roleError.message}`);
  if (!roles?.length) throw new HttpError(403, 'You do not have permission to manage households.', 'forbidden');

  const admin = createClient(supabaseUrl, secretKey, clientOptions);
  return { admin, user: userData.user, userClient };
}
