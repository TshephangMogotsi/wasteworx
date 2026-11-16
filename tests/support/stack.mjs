// Starts an isolated copy of the app for tests: a stand-in for Supabase Auth, the
// Worker on a throwaway local D1 database, and optionally the website. Nothing here
// touches real Supabase, the developer's local database, or any deployed resource.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const wranglerBin = join(root, 'node_modules/wrangler/bin/wrangler.js');
const viteBin = join(root, 'node_modules/vite/bin/vite.js');
const wranglerConfig = join(root, 'cloudflare/api/wrangler.jsonc');
const database = 'wasteworx-development';

export const password = 'stand-in-password';
export const people = {
  staffA: { id: '11111111-1111-4111-8111-111111111111', email: 'staff.a@example.test', role: 'registration_staff', confirmed: true },
  staffB: { id: '22222222-2222-4222-8222-222222222222', email: 'staff.b@example.test', role: 'super_admin', confirmed: true },
  resident: { id: '33333333-3333-4333-8333-333333333333', email: 'resident@example.test', role: null, confirmed: true },
  unconfirmed: { id: '44444444-4444-4444-8444-444444444444', email: 'unconfirmed@example.test', role: null, confirmed: false },
};

const encode = (object) => Buffer.from(JSON.stringify(object)).toString('base64url');
const byEmail = (email) => Object.values(people).find((person) => person.email === email);
const authUser = (person) => ({
  id: person.id, aud: 'authenticated', role: 'authenticated', email: person.email,
  email_confirmed_at: person.confirmed ? '2026-01-01T00:00:00Z' : null,
  app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-01-01T00:00:00Z',
});

/** A token shaped like a JWT so the Supabase client accepts it. Only the stand-in auth server reads it. */
export function tokenFor(person) {
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ sub: person.id, email: person.email, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.stand-in`;
}

function personFor(token) {
  try { return byEmail(JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).email); } catch { return undefined; }
}

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createNetServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => resolve(port)); });
  });
}

/** Implements the three Supabase Auth endpoints the app uses: password sign-in, token lookup and sign-out. */
async function startAuth() {
  const server = createServer(async (request, response) => {
    const cors = { 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-allow-origin': '*' };
    const send = (status, body) => { response.writeHead(status, { 'content-type': 'application/json', ...cors }); response.end(JSON.stringify(body)); };
    if (request.method === 'OPTIONS') return send(204, {});
    let raw = ''; for await (const chunk of request) raw += chunk;
    const url = new URL(request.url, 'http://stand-in');
    if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password') {
      const credentials = JSON.parse(raw || '{}'); const person = byEmail(credentials.email);
      if (!person || !person.confirmed || credentials.password !== password) return send(400, { error: 'invalid_grant', error_description: 'Invalid login credentials' });
      return send(200, { access_token: tokenFor(person), token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'stand-in-refresh', user: authUser(person) });
    }
    if (url.pathname === '/auth/v1/user') {
      const person = personFor((request.headers.authorization ?? '').replace('Bearer ', ''));
      return person ? send(200, authUser(person)) : send(401, { error: 'invalid token' });
    }
    if (url.pathname === '/auth/v1/logout') return send(204, {});
    return send(404, { error: 'not_found' });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

const childEnvironment = (extra = {}) => ({ ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false', ...extra });

function wrangler(args) {
  const result = spawnSync(process.execPath, [wranglerBin, ...args, '--config', wranglerConfig], { cwd: root, encoding: 'utf8', env: childEnvironment() });
  if (result.status !== 0) throw new Error(`wrangler ${args.slice(0, 3).join(' ')} failed:\n${result.stdout}\n${result.stderr}`);
}

/** Runs a long-lived child in its own process group so its helpers (such as workerd) stop with it. */
function launch(name, args, env) {
  const child = spawn(process.execPath, args, { cwd: root, detached: true, env: childEnvironment(env), stdio: ['ignore', 'pipe', 'pipe'] });
  const service = { child, name, output: '' };
  child.stdout.on('data', (chunk) => { service.output += chunk; });
  child.stderr.on('data', (chunk) => { service.output += chunk; });
  return service;
}

async function ready(service, url) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (service.child.exitCode !== null) throw new Error(`${service.name} exited before it was ready:\n${service.output}`);
    try { if ((await fetch(url)).ok) return; } catch { /* not listening yet */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${service.name} was not ready after 90 seconds:\n${service.output}`);
}

function signal(service, name) {
  try { process.kill(-service.child.pid, name); } catch { /* already stopped */ }
}

async function halt(service) {
  if (service.child.exitCode !== null) return;
  const exited = new Promise((resolve) => service.child.once('exit', resolve));
  signal(service, 'SIGTERM');
  const timer = setTimeout(() => signal(service, 'SIGKILL'), 5_000);
  await exited; clearTimeout(timer);
}

/**
 * @param {{ web?: boolean }} [options] Pass `web: true` to also start the website.
 * The returned `call(person, method, path, body)` makes an API request as one of `people` (or `null` for no token).
 */
export async function startStack({ web = false } = {}) {
  if (!existsSync(join(root, 'dist-web/index.html'))) throw new Error('dist-web is missing. Run `npm run web:build` first; the Worker config requires it.');
  const directory = mkdtempSync(join(tmpdir(), 'wasteworx-test-'));
  const services = [];
  const auth = await startAuth();
  let authOpen = true;
  const stopAuth = async () => { if (!authOpen) return; authOpen = false; auth.server.closeAllConnections(); await new Promise((resolve) => auth.server.close(resolve)); };
  const stop = async () => { await Promise.all(services.map(halt)); await stopAuth(); rmSync(directory, { force: true, recursive: true }); };
  const killOnExit = () => services.forEach((service) => signal(service, 'SIGKILL'));
  process.once('exit', killOnExit);

  try {
    const state = join(directory, 'd1'); const envFile = join(directory, 'worker.env');
    writeFileSync(envFile, `SUPABASE_URL=${auth.url}\nSUPABASE_PUBLISHABLE_KEY=stand-in\n`);
    wrangler(['d1', 'migrations', 'apply', database, '--local', '--persist-to', state]);
    const staffMembers = Object.values(people).filter((person) => person.role);
    wrangler(['d1', 'execute', database, '--local', '--persist-to', state, '--command', [
      `insert into app_users (id, legacy_supabase_user_id, email, created_at, updated_at) values ${staffMembers.map((person) => `('${person.id}', '${person.id}', '${person.email}', '2026-01-01', '2026-01-01')`).join(', ')};`,
      `insert into user_roles (user_id, role, granted_at) values ${staffMembers.map((person) => `('${person.id}', '${person.role}', '2026-01-01')`).join(', ')};`,
    ].join(' ')]);

    const apiUrl = `http://127.0.0.1:${await freePort()}`;
    const api = launch('Worker', [wranglerBin, 'dev', '--config', wranglerConfig, '--ip', '127.0.0.1', '--port', new URL(apiUrl).port, '--inspector-port', String(await freePort()), '--persist-to', state, '--env-file', envFile, '--show-interactive-dev-session=false']);
    services.push(api);
    await ready(api, `${apiUrl}/v1/health`);

    let webUrl = null;
    if (web) {
      webUrl = `http://127.0.0.1:${await freePort()}`;
      const site = launch('Website', [viteBin, '--host', '127.0.0.1', '--port', new URL(webUrl).port, '--strictPort'], { API_PROXY_TARGET: apiUrl, VITE_SUPABASE_PUBLISHABLE_KEY: 'stand-in', VITE_SUPABASE_URL: auth.url });
      services.push(site);
      await ready(site, webUrl);
    }

    const call = async (person, method, path, body, rawBody) => {
      const response = await fetch(`${apiUrl}/v1${path}`, {
        body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)),
        headers: { ...(person ? { authorization: `Bearer ${tokenFor(person)}` } : {}), 'content-type': 'application/json' },
        method,
      });
      return { body: await response.json().catch(() => null), status: response.status };
    };
    return { apiUrl, call, stop, stopAuth, webUrl };
  } catch (error) {
    await stop();
    throw error;
  }
}
