import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const replace = process.argv.includes('--replace');
const production = process.argv.includes('--production');
if (!replace) {
  throw new Error('Refusing to change D1 without --replace.');
}

const config = production ? 'cloudflare/api/wrangler.production.jsonc' : 'cloudflare/api/wrangler.jsonc';
const database = production ? 'wasteworx-production' : 'wasteworx-development';
const tables = [
  'user_roles', 'addresses', 'households', 'household_memberships', 'household_invitation_attempts',
  'collector_household_assignments', 'businesses', 'business_sites', 'business_evidence',
  'business_reviews', 'business_memberships', 'business_invitation_attempts',
];
const deleteOrder = [
  'audit_logs', 'business_invitation_attempts', 'business_memberships', 'business_reviews', 'business_evidence',
  'business_sites', 'businesses', 'household_invitation_attempts', 'collector_household_assignments',
  'household_memberships', 'households', 'addresses', 'user_roles', 'app_users',
];

function run(command, args) {
  return execFileSync(command, args, { cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function supabaseRows(sql) {
  const output = run('supabase', ['db', 'query', '--linked', '--output', 'json', sql]);
  const start = output.indexOf('{');
  if (start === -1) throw new Error(`Supabase returned no JSON for query: ${sql}`);
  return JSON.parse(output.slice(start)).rows;
}

function quote(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (typeof value === 'boolean') return value ? '1' : '0';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return `'${text.replaceAll("'", "''")}'`;
}

function insertStatements(table, rows) {
  const statements = [];
  for (const row of rows) {
    const columns = Object.keys(row);
    if (!columns.length) continue;
    statements.push(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map((column) => quote(row[column])).join(', ')});`);
  }
  return statements;
}

const aggregate = (table, query = `select * from public.${table}`) => `
  select '${table}' as table_name, coalesce(jsonb_agg(to_jsonb(source)), '[]'::jsonb) as rows from (${query}) source
`;
const exportQuery = [
  aggregate('app_users', `select id::text as id, id::text as legacy_supabase_user_id, lower(email) as email,
    coalesce(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', '') as full_name,
    created_at::text as created_at, updated_at::text as updated_at from auth.users order by created_at`),
  ...tables.map((table) => aggregate(table)),
  aggregate('audit_logs', `select id, table_name, record_id::text as record_id, action::text as action,
    actor_user_id::text as actor_user_id, old_values, new_values, occurred_at::text as occurred_at from public.audit_logs order by id`),
].join(' union all ');

const imported = Object.fromEntries(supabaseRows(exportQuery).map(({ table_name: table, rows }) => [
  table,
  typeof rows === 'string' ? JSON.parse(rows) : rows,
]));
const statements = [
  ...deleteOrder.map((table) => `DELETE FROM ${table};`),
  ...insertStatements('app_users', imported.app_users),
  ...tables.flatMap((table) => insertStatements(table, imported[table])),
  ...insertStatements('audit_logs', imported.audit_logs),
];
const directory = mkdtempSync(join(tmpdir(), 'wasteworx-d1-import-'));
const sqlFile = join(directory, 'import.sql');
try {
  writeFileSync(sqlFile, statements.join('\n'));
  run('npx', ['--yes', 'wrangler', 'd1', 'execute', database, '--remote', '--config', config, '--file', sqlFile]);
} finally {
  rmSync(directory, { force: true, recursive: true });
}

console.log(JSON.stringify({ imported: Object.fromEntries(Object.entries(imported).map(([table, rows]) => [table, rows.length])), target: database }));
