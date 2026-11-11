import { authenticateSupabase } from './supabase-auth';
import { sendTransactionalEmail } from './email';

type D1Statement = {
  first<T>(): Promise<T | null>;
  bind(...values: unknown[]): D1Statement;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
};

type D1Database = {
  batch(statements: D1Statement[]): Promise<unknown>;
  prepare(query: string): D1Statement;
};

type Queue = {
  send(message: unknown): Promise<void>;
};

type Assets = {
  fetch(request: Request): Promise<Response>;
};

export type Env = {
  CORS_ORIGIN: string;
  EMAIL_FROM: string;
  ASSETS: Assets;
  DB: D1Database;
  ENVIRONMENT: 'development' | 'production';
  JOBS: Queue;
  RESEND_API_KEY?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  SUPABASE_URL?: string;
};

const json = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), {
  ...init,
  headers: { 'content-type': 'application/json; charset=utf-8', ...securityHeaders(), ...init.headers },
});

const securityHeaders = () => ({
  'content-security-policy': "default-src 'self'; base-uri 'self'; connect-src 'self' https://*.supabase.co; form-action 'self'; frame-ancestors 'none'; img-src 'self' data: https:; object-src 'none'; script-src 'self'; style-src 'self'; upgrade-insecure-requests",
  'permissions-policy': 'camera=(), geolocation=(), microphone=(), payment=()',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
});

const secure = (response: Response) => {
  const headers = new Headers(response.headers);
  for (const [name, header] of Object.entries(securityHeaders())) headers.set(name, header);
  return new Response(response.body, { headers, status: response.status, statusText: response.statusText });
};

const cors = (request: Request, env: Env) => ({
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'GET, POST, PATCH, OPTIONS',
  'access-control-allow-origin': request.headers.get('origin') === env.CORS_ORIGIN ? env.CORS_ORIGIN : '',
  vary: 'Origin',
});

type Principal = { email: string; id: string; roles: string[] };
const now = () => new Date().toISOString();
const newId = () => crypto.randomUUID();
const value = (body: Record<string, unknown>, key: string, maximum = 2_000) => {
  const input = body[key];
  if (input !== undefined && typeof input !== 'string') throw new Error(`${key} must be text.`);
  const result = (input ?? '').trim();
  if (result.length > maximum) throw new Error(`${key} is too long.`);
  return result;
};

async function principal(request: Request, env: Env): Promise<Principal | Response> {
  const authentication = await authenticateSupabase(request, env);
  if (!authentication.ok) return json({ error: authentication.code }, { status: authentication.status, headers: cors(request, env) });
  if (!authentication.identity.email) return json({ error: 'email_unavailable' }, { status: 422, headers: cors(request, env) });
  const existing = await env.DB.prepare('select id, email from app_users where legacy_supabase_user_id = ? or lower(email) = lower(?) limit 1')
    .bind(authentication.identity.id, authentication.identity.email).first<{ email: string; id: string }>();
  const user = existing ?? { id: authentication.identity.id, email: authentication.identity.email };
  if (!existing) {
    const timestamp = now();
    await env.DB.prepare('insert into app_users (id, legacy_supabase_user_id, email, full_name, created_at, updated_at) values (?, ?, ?, ?, ?, ?)')
      .bind(user.id, authentication.identity.id, user.email, authentication.identity.name ?? '', timestamp, timestamp).run();
    await env.DB.prepare("update household_memberships set user_id = ?, status = case when status in ('pending', 'invited') then 'active' else status end, activated_at = coalesce(activated_at, ?) where lower(email) = lower(?) and status <> 'revoked'")
      .bind(user.id, timestamp, user.email).run();
    await env.DB.prepare("update business_memberships set user_id = ?, status = case when status in ('pending', 'invited') then 'active' else status end, activated_at = coalesce(activated_at, ?) where lower(email) = lower(?) and status <> 'revoked'")
      .bind(user.id, timestamp, user.email).run();
  }
  const roles = await env.DB.prepare('select role from user_roles where user_id = ?').bind(user.id).all<{ role: string }>();
  return { id: user.id, email: user.email, roles: roles.results.map(({ role }) => role) };
}

function staff(identity: Principal) {
  return identity.roles.includes('super_admin') || identity.roles.includes('registration_staff');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const headers = cors(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });

    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/v1/health') {
      const database = await env.DB.prepare('select 1 as ok').first<{ ok: number }>();
      return json({ database: database?.ok === 1 ? 'ok' : 'unavailable', environment: env.ENVIRONMENT, service: 'wasteworx-api' }, { headers });
    }

    if (request.method === 'GET' && url.pathname === '/v1/me') {
      const authentication = await authenticateSupabase(request, env);
      if (!authentication.ok) return json({ error: authentication.code }, { status: authentication.status, headers });

      const profile = await env.DB.prepare(
        'select id, email, full_name from app_users where legacy_supabase_user_id = ? limit 1',
      ).bind(authentication.identity.id).first<{ email: string; full_name: string; id: string }>();
      return json({ identity: authentication.identity, profile }, { headers });
    }

    if (request.method === 'GET' && url.pathname === '/v1/businesses') {
      const identity = await principal(request, env);
      if (identity instanceof Response) return identity;
      const query = staff(identity)
        ? 'select id, registered_name, verification_status, service_status, updated_at from businesses order by updated_at desc'
        : `select b.id, b.registered_name, b.verification_status, b.service_status, b.updated_at from businesses b join business_memberships m on m.business_id = b.id where m.user_id = ? and m.status = 'active' order by b.updated_at desc`;
      const rows = staff(identity) ? await env.DB.prepare(query).all() : await env.DB.prepare(query).bind(identity.id).all();
      return json({ businesses: rows.results }, { headers });
    }

    if (request.method === 'POST' && url.pathname === '/v1/businesses') {
      const identity = await principal(request, env);
      if (identity instanceof Response) return identity;
      if (!staff(identity)) return json({ error: 'staff_access_required' }, { status: 403, headers });
      try {
        const body = await request.json() as Record<string, unknown>;
        const requestKey = value(body, 'request_key', 120);
        const submit = body.submit === true;
        const registeredName = value(body, 'registered_name', 240);
        const registrationNumber = value(body, 'registration_number', 120) || null;
        const registrationException = value(body, 'registration_exception', 1_000);
        const contactEmail = value(body, 'contact_email', 320).toLowerCase();
        const sites = Array.isArray(body.sites) ? body.sites as Record<string, unknown>[] : [];
        if (!requestKey) throw new Error('request_key is required.');
        if (submit && (!registeredName || !value(body, 'industry', 160) || (!registrationNumber && !registrationException) || !contactEmail || !sites.length)) {
          throw new Error('Complete the required business registration details.');
        }
        if (contactEmail && !/^\S+@\S+\.\S+$/.test(contactEmail)) throw new Error('Enter a valid contact email address.');
        const existing = await env.DB.prepare('select id from businesses where created_by = ? and request_key = ?').bind(identity.id, requestKey).first<{ id: string }>();
        const businessId = existing?.id ?? newId(); const timestamp = now();
        const status = submit ? 'submitted' : 'draft';
        const statements = [
          env.DB.prepare(`insert into businesses (id, request_key, registered_name, trading_name, registration_number, registration_exception, country_code, industry, contact_name, contact_role, contact_email, contact_phone, service_needs, verification_status, created_by, created_at, updated_at)
            values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            on conflict(created_by, request_key) do update set registered_name=excluded.registered_name, trading_name=excluded.trading_name, registration_number=excluded.registration_number, registration_exception=excluded.registration_exception, country_code=excluded.country_code, industry=excluded.industry, contact_name=excluded.contact_name, contact_role=excluded.contact_role, contact_email=excluded.contact_email, contact_phone=excluded.contact_phone, service_needs=excluded.service_needs, verification_status=excluded.verification_status, version=businesses.version+1, updated_at=excluded.updated_at`)
            .bind(businessId, requestKey, registeredName, value(body, 'trading_name', 240), registrationNumber, registrationException, value(body, 'country_code', 2) || 'BW', value(body, 'industry', 160), value(body, 'contact_name', 160), value(body, 'contact_role', 160), contactEmail, value(body, 'contact_phone', 40), value(body, 'service_needs', 2_000), status, identity.id, timestamp, timestamp),
          env.DB.prepare('insert into business_evidence (id, business_id, reference, notes) values (?, ?, ?, ?) on conflict(business_id) do update set reference=excluded.reference, notes=excluded.notes')
            .bind(newId(), businessId, value(body, 'evidence_reference', 500), value(body, 'evidence_notes', 2_000)),
        ];
        if (existing) statements.push(env.DB.prepare('delete from business_sites where business_id = ?').bind(businessId));
        for (const site of sites) {
          const name = value(site, 'name', 160); const address = value(site, 'address', 400); const city = value(site, 'city', 160);
          if (submit && (!name || !address || !city)) throw new Error('Complete each collection site.');
          statements.push(env.DB.prepare('insert into business_sites (id, business_id, name, address, city) values (?, ?, ?, ?, ?)').bind(newId(), businessId, name, address, city));
        }
        statements.push(env.DB.prepare('insert into audit_logs (table_name, record_id, action, actor_user_id, new_values, occurred_at) values (?, ?, ?, ?, ?, ?)').bind('businesses', businessId, existing ? 'update' : 'insert', identity.id, JSON.stringify({ verification_status: status }), timestamp));
        await env.DB.batch(statements);
        return json({ id: businessId, verification_status: status }, { status: existing ? 200 : 201, headers });
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : 'registration_failed' }, { status: 400, headers });
      }
    }

    if (request.method === 'GET' && url.pathname === '/v1/households') {
      const identity = await principal(request, env);
      if (identity instanceof Response) return identity;
      if (!staff(identity)) return json({ error: 'staff_access_required' }, { status: 403, headers });
      const rows = await env.DB.prepare('select h.id, h.household_code, h.name, h.status, a.address_line_1, a.suburb, a.city from households h join addresses a on a.id = h.address_id order by h.created_at desc').all();
      return json({ households: rows.results }, { headers });
    }

    if (request.method === 'POST' && url.pathname === '/v1/households') {
      const identity = await principal(request, env);
      if (identity instanceof Response) return identity;
      if (!staff(identity)) return json({ error: 'staff_access_required' }, { status: 403, headers });
      try {
        const body = await request.json() as Record<string, unknown>;
        const name = value(body, 'household_name', 160); const contactName = value(body, 'primary_contact_name', 160); const email = value(body, 'primary_contact_email', 320).toLowerCase();
        const addressLine = value(body, 'address_line_1', 200); const suburb = value(body, 'suburb', 120); const city = value(body, 'city', 120);
        if (!name || !contactName || !email || !addressLine || !suburb || !city || body.consent_confirmed !== true) throw new Error('Complete all required fields and confirm consent.');
        if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Enter a valid primary-contact email address.');
        const timestamp = now(); const addressId = newId(); const householdId = newId(); const membershipId = newId();
        const count = await env.DB.prepare('select count(*) as count from households').first<{ count: number }>();
        const code = `WW-${String((count?.count ?? 0) + 1).padStart(5, '0')}`;
        await env.DB.batch([
          env.DB.prepare('insert into addresses (id, property_reference, address_line_1, address_line_2, suburb, city, district, access_notes, verification_status, verification_method, created_by, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(addressId, value(body, 'property_reference', 120) || null, addressLine, value(body, 'address_line_2', 200), suburb, city, value(body, 'district', 120), value(body, 'access_notes', 1_000), 'verified', value(body, 'verification_method', 40) || 'event_in_person', identity.id, timestamp, timestamp),
          env.DB.prepare('insert into households (id, household_code, name, address_id, status, operational_notes, consent_version, consented_at, registered_by, registered_at, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(householdId, code, name, addressId, 'verified', value(body, 'operational_notes', 1_000), 'pilot-v1', timestamp, identity.id, timestamp, timestamp, timestamp),
          env.DB.prepare('insert into household_memberships (id, household_id, full_name, email, phone, member_type, status, created_by, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(membershipId, householdId, contactName, email, value(body, 'primary_contact_phone', 40), 'primary_contact', 'pending', identity.id, timestamp, timestamp),
          env.DB.prepare('insert into audit_logs (table_name, record_id, action, actor_user_id, new_values, occurred_at) values (?, ?, ?, ?, ?, ?)').bind('households', householdId, 'insert', identity.id, JSON.stringify({ household_code: code }), timestamp),
        ]);
        const invitation = await sendTransactionalEmail(env, { to: email, subject: 'Your WasteWorx household is ready', text: `Your household ${code} has been registered. Create or sign in to your WasteWorx account to continue.`, html: `<h1>Welcome to WasteWorx</h1><p>Your household ${code} has been registered. Create or sign in to your WasteWorx account to continue.</p>` });
        return json({ created_household_id: householdId, created_household_code: code, invitation: invitation.ok ? 'sent' : 'pending' }, { status: 201, headers });
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : 'registration_failed' }, { status: 400, headers });
      }
    }

    if (url.pathname.startsWith('/v1/')) return json({ error: 'not_found' }, { status: 404, headers });
    return secure(await env.ASSETS.fetch(request));
  },
};
import { authenticateSupabase } from './supabase-auth';

