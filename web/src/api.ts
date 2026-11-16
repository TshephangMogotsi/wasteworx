import { supabase } from './supabase';

async function token() {
  const { data } = await supabase?.auth.getSession() ?? { data: { session: null } };
  return data.session?.access_token;
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const accessToken = await token();
  const response = await fetch(`/v1${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      ...options.headers,
    },
  });
  const body = await response.json().catch(() => null) as (T & { error?: string }) | null;
  if (!response.ok) throw new Error(body?.error ?? 'The request could not be completed.');
  // A successful non-JSON reply means something other than the API answered (for example an HTML fallback).
  if (body === null) throw new Error('The API returned an unexpected response. Check that the API is running.');
  return body;
}
