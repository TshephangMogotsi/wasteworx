import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Run with PGLITE_MODULE pointing to an isolated install, or install @electric-sql/pglite locally.
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
const root = fileURLToPath(new URL('../', import.meta.url));
const staff = '00000000-0000-4000-8000-000000000001';
const client = '00000000-0000-4000-8000-000000000002';
const outsider = '00000000-0000-4000-8000-000000000003';
const siteContact = '00000000-0000-4000-8000-000000000004';
const admin = '00000000-0000-4000-8000-000000000005';
const pending = '00000000-0000-4000-8000-000000000006';
await db.exec(`
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth;
  create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  grant usage on schema auth to authenticated,anon,service_role;
  grant execute on function auth.uid() to authenticated,anon,service_role;
`);
for (const file of (await readdir(`${root}supabase/migrations`)).filter((name) => name.endsWith('.sql')).sort()) {
  await db.exec(await readFile(`${root}supabase/migrations/${file}`, 'utf8'));
}
await db.query(`insert into auth.users values ($1,'staff@example.test',now()),($2,'owner@example.test',now()),
  ($3,'other@example.test',now()),($4,'site@example.test',now()),($5,'admin@example.test',now()),($6,'pending@example.test',null)`, [staff, client, outsider, siteContact, admin, pending]);
await db.query(`insert into public.user_roles(user_id,role) values ($1,'registration_staff'),($2,'super_admin')`, [staff, admin]);
async function asUser(user, sql, parameters = [], role = 'authenticated') {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${role}`);
    await tx.query(`select set_config('request.jwt.claim.sub',$1,true)`, [user ?? '']);
    return tx.query(sql, parameters);
  });
}
async function rejects(user, sql, args, expression, role) {
  await assert.rejects(asUser(user, sql, args, role), expression);
}
const payload = {
  registered_name: 'Example Recycling Client', registration_number: 'TEST-123', country_code: 'BW', industry: 'Hospitality',
  contact_name: 'Test Owner', contact_email: 'OWNER@example.test', contact_phone: '5550100', evidence_reference: 'Registry reference TEST-123 checked',
  sites: [{ name: 'Main branch', address: '1 Test Road', city: 'Gaborone' }, { name: 'Second branch', address: '2 Test Road', city: 'Gaborone' }],
  submit: true,
};
const save = 'select public.save_business_onboarding($1::jsonb,$2,$3::uuid,$4) as id';
await rejects(outsider, save, [JSON.stringify(payload), 'unauthorised', null, 0], /Staff access/);
await rejects(null, save, [JSON.stringify(payload), 'anonymous', null, 0], /permission denied/, 'anon');
const { rows: [{ id }] } = await asUser(staff, save, [JSON.stringify(payload), 'create-1', null, 0]);
const retry = await asUser(staff, save, [JSON.stringify(payload), 'create-1', null, 0]);
assert.equal(retry.rows[0].id, id, 'create retry returns original business');
await rejects(staff, save, [JSON.stringify(payload), 'duplicate', null, 0], /unique constraint/);
await rejects(staff, save, [JSON.stringify({ ...payload, registered_name: 'Incomplete', registration_number: 'TEST-2', evidence_reference: '' }), 'invalid', null, 0], /Complete business identity/);
assert.equal((await db.query(`select count(*)::integer n from businesses`)).rows[0].n, 1, 'failed transaction leaves no partial business');
const version = async () => (await db.query('select version from businesses where id=$1', [id])).rows[0].version;
const reviewSql = 'select public.review_business_onboarding($1,$2,$3,$4,$5)';
const review = async (decision, site = null, actor = staff) => asUser(actor, reviewSql, [id, decision, 'Evidence reviewed by staff', await version(), site]);
await rejects(staff, reviewSql, [id, 'activate', 'Test reason', await version(), null], /current state/);
await review('start_review');
const { rows: sites } = await db.query('select * from business_sites where business_id=$1 order by name', [id]);
await review('verify_site', sites[0].id);
await review('request_changes');
const editPayload = { ...payload, sites, contact_email: 'owner@example.test' };
await rejects(staff, save, [JSON.stringify(editPayload), 'edit', id, 0], /changed/);
await asUser(staff, save, [JSON.stringify(editPayload), 'edit', id, await version()]);
assert.equal((await db.query('select verification_status from business_sites where id=$1', [sites[0].id])).rows[0].verification_status, 'pending', 'corrections require site re-review');
await review('start_review');
await review('verify', null, admin);
await rejects(staff, reviewSql, [id, 'activate', 'Evidence reviewed', await version(), null], /Activate at least one/);
await review('verify_site', sites[0].id);
await review('activate_site', sites[0].id);
await review('activate');
assert.equal((await db.query('select verification_status from business_sites where id=$1', [sites[1].id])).rows[0].verification_status, 'pending', 'second site remains pending');
await rejects(outsider, 'update businesses set service_status=$1 where id=$2', ['active', id], /permission denied/);
await rejects(staff, 'update businesses set service_status=$1 where id=$2', ['active', id], /permission denied/);
const reserved = (await asUser(staff, 'select reserve_business_invitation($1) as r', [id])).rows[0].r;
assert.equal(reserved.existing_user_id, client, 'confirmed account detected by server');
await rejects(staff, 'select reserve_business_invitation($1)', [id], /rate limit/);
await rejects(client, 'select finish_business_invitation($1,$2)', [reserved.attempt_id, client], /permission denied/);
await rejects(null, 'select finish_business_invitation($1,$2)', [reserved.attempt_id, outsider], /does not match/, 'service_role');
await asUser(null, 'select finish_business_invitation($1,$2)', [reserved.attempt_id, client], 'service_role');
assert.equal((await asUser(client, 'select * from businesses')).rows.length, 1);
assert.equal((await asUser(client, 'select * from business_sites')).rows.length, 2);
for (const table of ['business_evidence', 'business_reviews', 'business_invitation_attempts']) {
  assert.equal((await asUser(client, `select * from ${table}`)).rows.length, 0, `${table} stays staff only`);
}
assert.equal((await asUser(outsider, 'select * from businesses')).rows.length, 0);
assert.equal((await asUser(outsider, 'select * from business_sites')).rows.length, 0);
const otherBusiness = (await db.query(`insert into businesses(request_key,registered_name,created_by) values('other-business','Other Customer',$1) returning id`, [staff])).rows[0].id;
await db.query(`insert into business_sites(business_id,name,address,city) values($1,'Other Site','3 Test Road','Gaborone')`, [otherBusiness]);
await db.query(`insert into business_memberships(business_id,user_id,email,full_name,status) values($1,$2,'other@example.test','Other Owner','active')`, [otherBusiness, outsider]);
assert.equal((await asUser(outsider, 'select * from businesses')).rows[0].id, otherBusiness, 'other client sees its own business');
assert.equal((await asUser(outsider, 'select * from businesses where id=$1', [id])).rows.length, 0, 'other client cannot read guessed business id');
assert.equal((await asUser(client, 'select * from businesses')).rows.length, 1, 'first client cannot read second business');
await db.query(`insert into business_memberships(business_id,user_id,email,full_name,role,site_id,status) values($1,$2,'site@example.test','Site Contact','site_contact',$3,'active')`, [id, siteContact, sites[0].id]);
assert.equal((await asUser(siteContact, 'select * from business_sites')).rows.length, 1, 'site contact sees one site');
assert.equal((await asUser(siteContact, 'select * from businesses')).rows.length, 1);
await db.query(`insert into business_memberships(business_id,user_id,email,full_name,status) values($1,$2,'pending@example.test','Pending Contact','invited')`, [id, pending]);
await asUser(pending, 'select activate_my_business_memberships()');
assert.equal((await asUser(pending, 'select * from businesses')).rows.length, 0, 'unconfirmed user cannot activate');
await db.query('update auth.users set email_confirmed_at=now() where id=$1', [pending]);
await asUser(outsider, 'select activate_my_business_memberships()');
assert.equal((await asUser(outsider, 'select * from businesses where id=$1', [id])).rows.length, 0, 'activation cannot claim another membership');
await asUser(pending, 'select activate_my_business_memberships()');
assert.equal((await asUser(pending, 'select * from businesses')).rows.length, 1);
const membershipId = (await db.query('select id from business_memberships where user_id=$1', [client])).rows[0].id;
await rejects(outsider, 'select revoke_business_membership($1,$2)', [membershipId, 'Unauthorised revoke'], /Staff access/);
await asUser(staff, 'select revoke_business_membership($1,$2)', [membershipId, 'Access no longer required']);
assert.equal((await asUser(client, 'select * from businesses')).rows.length, 0, 'revocation immediately removes access');
await review('suspend');
await rejects(staff, 'select reserve_business_invitation($1)', [id], /Activate a verified/);
assert.ok((await db.query(`select count(*)::integer n from audit_logs where table_name='businesses'`)).rows[0].n > 0);
const draft = { sites: [{ name: '', address: '', city: '' }, { name: '', address: '', city: '' }], submit: false };
const draftId = (await asUser(staff, save, [JSON.stringify(draft), 'blank-draft', null, 0])).rows[0].id;
assert.equal((await db.query('select count(*)::integer n from business_sites where business_id=$1', [draftId])).rows[0].n, 2, 'multiple incomplete sites can be saved as a draft');
await rejects(staff, save, [JSON.stringify({ ...payload, sites: [sites[0]] }), 'omit-site', id, await version()], /Only drafts/);
await rejects(staff, reviewSql, [id, 'activate', 'Review reason', 0, null], /changed/);
await rejects(outsider, 'select reserve_business_invitation($1)', [id], /Staff access/);
await review('reopen');
const reopened = (await db.query('select verification_status,service_status from businesses where id=$1', [id])).rows[0];
assert.equal(reopened.verification_status, 'changes_requested');
assert.equal(reopened.service_status, 'inactive');
assert.equal((await db.query("select count(*)::integer n from business_sites where business_id=$1 and service_status='active'", [id])).rows[0].n, 0);
await rejects(staff, save, [JSON.stringify({ ...editPayload, sites: [sites[0]] }), 'omit-existing-site', id, await version()], /Keep all existing sites/);
await rejects(staff, save, [JSON.stringify({ ...editPayload, sites: [{ ...sites[0], id: '00000000-0000-4000-8000-000000000099' }, sites[1]] }), 'forged-site', id, await version()], /Keep all existing sites|Site does not belong/);
console.log('PASS: all migrations, draft retries, duplicate prevention, correction review, staff approvals, activation gates, invitation limits, identity matching, client/site isolation, confirmation and revocation.');
await db.close();
