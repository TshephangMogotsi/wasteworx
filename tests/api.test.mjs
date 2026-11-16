// API tests for the Cloudflare Worker. They run in order and share one throwaway database,
// so later tests build on records created by earlier ones.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { people, startStack } from './support/stack.mjs';

const { staffA, staffB, resident, unconfirmed } = people;
let stack; let call;

before(async () => { stack = await startStack(); call = stack.call; }, { timeout: 180_000 });
after(async () => { await stack?.stop(); });

const household = (number, extra = {}) => ({
  household_name: `House ${number}`, primary_contact_name: 'Pat Example', primary_contact_email: `house${number}@example.test`,
  address_line_1: `${number} Test Road`, suburb: 'Phakalane', city: 'Gaborone', property_reference: `PLOT-${number}`, consent_confirmed: true, ...extra,
});

const business = (extra = {}) => ({
  registered_name: 'Acme Recycling', industry: 'Retail', registration_number: 'BW-100', contact_email: 'contact@example.test', country_code: 'BW',
  evidence_reference: 'Certificate seen', sites: [{ name: 'Head office', address: '1 Main Road', city: 'Gaborone' }], ...extra,
});

describe('access', () => {
  test('health check needs no sign-in', async () => {
    const response = await call(null, 'GET', '/health');
    assert.equal(response.status, 200);
    assert.equal(response.body.database, 'ok');
  });

  test('a request without a token is refused', async () => {
    assert.equal((await call(null, 'GET', '/businesses')).status, 401);
  });

  test('an account with an unconfirmed email is refused', async () => {
    const response = await call(unconfirmed, 'GET', '/businesses');
    assert.equal(response.status, 403);
    assert.equal(response.body.error, 'email_unverified');
  });

  test('a signed-in user without a staff role cannot use staff endpoints', async () => {
    assert.equal((await call(resident, 'GET', '/households')).status, 403);
    assert.equal((await call(resident, 'POST', '/households', household(900))).status, 403);
    assert.equal((await call(resident, 'POST', '/businesses', { ...business(), request_key: 'resident', submit: true })).status, 403);
    assert.deepEqual((await call(resident, 'GET', '/businesses')).body, { businesses: [] });
  });

  test('an unknown API path returns a JSON 404', async () => {
    const response = await call(staffA, 'GET', '/nothing-here');
    assert.equal(response.status, 404);
    assert.equal(response.body.error, 'not_found');
  });
});

describe('household registration', () => {
  test('20 simultaneous registrations all succeed with distinct codes', async () => {
    const responses = await Promise.all(Array.from({ length: 20 }, (_, index) => call(staffA, 'POST', '/households', household(index))));
    assert.deepEqual([...new Set(responses.map((response) => response.status))], [201]);
    const codes = responses.map((response) => response.body.created_household_code);
    assert.equal(new Set(codes).size, 20);
    for (const code of codes) assert.match(code, /^WWX-[A-Z0-9]{8}$/);
  });

  test('the invitation is reported as pending when email is not configured', async () => {
    const response = await call(staffA, 'POST', '/households', household(100));
    assert.equal(response.status, 201);
    assert.equal(response.body.invitation, 'pending');
  });

  test('a duplicate property reference gets a readable conflict', async () => {
    const response = await call(staffA, 'POST', '/households', household(0, { household_name: 'Duplicate' }));
    assert.equal(response.status, 409);
    assert.equal(response.body.error, 'A household is already registered with this property reference.');
  });

  test('missing consent is rejected', async () => {
    const response = await call(staffA, 'POST', '/households', household(200, { consent_confirmed: false }));
    assert.equal(response.status, 400);
  });

  test('staff can list registered households', async () => {
    const response = await call(staffA, 'GET', '/households');
    assert.equal(response.status, 200);
    assert.equal(response.body.households.length, 21);
  });
});

describe('business registration', () => {
  let acmeId;

  test('staff can register and submit a business', async () => {
    const response = await call(staffA, 'POST', '/businesses', { ...business(), request_key: 'acme', submit: true });
    assert.equal(response.status, 201);
    assert.equal(response.body.verification_status, 'submitted');
    acmeId = response.body.id;
  });

  test('repeating the same request does not create a second business', async () => {
    const response = await call(staffA, 'POST', '/businesses', { ...business(), request_key: 'acme', submit: true });
    assert.equal(response.status, 200);
    assert.equal(response.body.id, acmeId);
    assert.equal((await call(staffA, 'GET', '/businesses')).body.businesses.length, 1);
  });

  test('a duplicate registered name gets a readable conflict', async () => {
    const response = await call(staffA, 'POST', '/businesses', { ...business({ registration_number: 'BW-101' }), request_key: 'same-name', submit: true });
    assert.equal(response.status, 409);
    assert.equal(response.body.error, 'A business with this registered name is already registered.');
  });

  test('a duplicate registration number gets a readable conflict', async () => {
    const response = await call(staffA, 'POST', '/businesses', { ...business({ registered_name: 'Other Trading' }), request_key: 'same-number', submit: true });
    assert.equal(response.status, 409);
    assert.equal(response.body.error, 'A business with this registration number is already registered.');
  });

  test('two sites with the same name get a readable conflict', async () => {
    const sites = [{ name: 'Depot', address: '1 First Road', city: 'Gaborone' }, { name: 'depot', address: '2 Second Road', city: 'Gaborone' }];
    const response = await call(staffA, 'POST', '/businesses', { ...business({ registered_name: 'Two Sites', registration_number: 'BW-102', sites }), request_key: 'two-sites', submit: true });
    assert.equal(response.status, 409);
    assert.equal(response.body.error, 'Two sites share the same name. Give each site its own name.');
  });

  test('invalid input is rejected with a 400', async () => {
    const attempt = (extra, rawBody) => call(staffA, 'POST', '/businesses', { ...business({ registered_name: 'Invalid Input', registration_number: 'BW-103' }), request_key: 'invalid', submit: true, ...extra }, rawBody);
    assert.equal((await attempt({ country_code: '1' })).body.error, 'country_code must be a two-letter country code.');
    assert.equal((await attempt({ sites: [null] })).body.error, 'Each site must be an object.');
    assert.equal((await attempt({ sites: [] })).status, 400);
    assert.equal((await attempt({ contact_email: 'not-an-email' })).status, 400);
    assert.equal((await attempt({ request_key: '' })).status, 400);
    assert.equal((await attempt({}, '{not json')).body.error, 'The request body must be a JSON object.');
    assert.equal((await attempt({}, '[]')).body.error, 'The request body must be a JSON object.');
  });

  test('rejected requests created nothing', async () => {
    assert.equal((await call(staffA, 'GET', '/businesses')).body.businesses.length, 1);
  });
});

describe('editing a business draft', () => {
  let draftId;
  const read = async () => (await call(staffA, 'GET', `/businesses/${draftId}`)).body.business;
  const complete = (extra = {}) => business({
    registered_name: 'Draft Company', registration_number: 'BW-200',
    sites: [{ name: 'Depot', address: '5 Kgale Road', city: 'Gaborone' }, { name: 'Shop', address: '9 Mall Road', city: 'Gaborone' }], ...extra,
  });

  test('staff A saves a draft', async () => {
    const response = await call(staffA, 'POST', '/businesses', { request_key: 'draft', submit: false, registered_name: 'Draft Company', sites: [{ name: '', address: '', city: '' }] });
    assert.equal(response.status, 201);
    assert.equal(response.body.verification_status, 'draft');
    draftId = response.body.id;
  });

  test('a non-staff user cannot read the draft', async () => {
    assert.equal((await call(resident, 'GET', `/businesses/${draftId}`)).status, 403);
  });

  test('another staff member can read the draft', async () => {
    const response = await call(staffB, 'GET', `/businesses/${draftId}`);
    assert.equal(response.status, 200);
    assert.equal(response.body.business.registered_name, 'Draft Company');
    assert.equal(response.body.business.version, 1);
    assert.equal(response.body.business.sites.length, 1);
  });

  test('another staff member can edit the draft', async () => {
    const response = await call(staffB, 'PUT', `/businesses/${draftId}`, { ...complete({ registered_name: 'Draft Company Renamed' }), submit: false, version: 1 });
    assert.equal(response.status, 200);
    assert.equal(response.body.version, 2);
  });

  test('an edit based on an old version is rejected', async () => {
    const response = await call(staffA, 'PUT', `/businesses/${draftId}`, { ...complete(), submit: false, version: 1 });
    assert.equal(response.status, 409);
    assert.equal(response.body.error, 'This draft was changed by someone else. Reload it and try again.');
  });

  test('an edit without a version, or an incomplete submit, is rejected', async () => {
    assert.equal((await call(staffA, 'PUT', `/businesses/${draftId}`, { ...complete(), submit: false })).status, 400);
    assert.equal((await call(staffA, 'PUT', `/businesses/${draftId}`, { registered_name: 'Draft Company Renamed', sites: [], submit: true, version: 2 })).status, 400);
  });

  test('a rejected edit leaves the draft untouched', async () => {
    const response = await call(staffA, 'PUT', `/businesses/${draftId}`, { ...complete({ registered_name: 'Acme Recycling' }), submit: false, version: 2 });
    assert.equal(response.status, 409);
    const draft = await read();
    assert.equal(draft.version, 2);
    assert.equal(draft.registered_name, 'Draft Company Renamed');
    assert.equal(draft.sites.length, 2);
  });

  test('of six simultaneous edits exactly one wins and is stored whole', async () => {
    const responses = await Promise.all(Array.from({ length: 6 }, (_, index) => call(index % 2 ? staffA : staffB, 'PUT', `/businesses/${draftId}`, {
      ...complete({ registered_name: `Race ${index}`, sites: [{ name: `Site ${index}`, address: `${index} Race Road`, city: 'Gaborone' }] }), submit: false, version: 2,
    })));
    assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409, 409, 409, 409, 409]);
    const draft = await read();
    assert.equal(draft.version, 3);
    assert.equal(draft.sites.length, 1);
    assert.equal(draft.sites[0].name, `Site ${draft.registered_name.split(' ')[1]}`);
  });

  test('the draft can be submitted', async () => {
    const response = await call(staffA, 'PUT', `/businesses/${draftId}`, { ...complete(), submit: true, version: 3 });
    assert.equal(response.status, 200);
    assert.equal(response.body.verification_status, 'submitted');
  });

  test('a submitted registration is locked', async () => {
    const response = await call(staffB, 'PUT', `/businesses/${draftId}`, { ...complete({ registered_name: 'Tampered' }), submit: false, version: 4 });
    assert.equal(response.status, 409);
    assert.equal(response.body.error, 'This registration has been submitted and can no longer be edited.');
  });

  test('replaying the original create request does not reopen it', async () => {
    const response = await call(staffA, 'POST', '/businesses', { request_key: 'draft', submit: false, registered_name: 'Reopened', sites: [] });
    assert.equal(response.status, 200);
    assert.equal(response.body.verification_status, 'submitted');
    const stored = await read();
    assert.equal(stored.registered_name, 'Draft Company');
    assert.equal(stored.verification_status, 'submitted');
    assert.equal(stored.sites.length, 2);
    assert.equal(stored.evidence_reference, 'Certificate seen');
  });

  test('an unknown business returns 404', async () => {
    const response = await call(staffA, 'PUT', '/businesses/00000000-0000-4000-8000-000000000000', { ...complete(), submit: false, version: 1 });
    assert.equal(response.status, 404);
  });
});

describe('failures', () => {
  // Keep this last: it stops the stand-in auth server.
  test('an unreachable auth service produces a JSON 500, not a crash page', async () => {
    await stack.stopAuth();
    const response = await call(staffA, 'GET', '/me');
    assert.equal(response.status, 500);
    assert.equal(response.body.error, 'internal_error');
  });
});
