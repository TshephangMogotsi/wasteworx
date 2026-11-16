// Browser test for the business draft flow. It drives the real website in headless Chrome
// against the local Worker and a stand-in auth server. Skipped when Chrome is not installed.
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import puppeteer from 'puppeteer-core';

import { password, people, startStack } from './support/stack.mjs';

const chrome = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].find((path) => path && existsSync(path));

test('staff can save, reopen, finish and submit a business draft', { skip: chrome ? false : 'Chrome was not found. Set CHROME_PATH to run this test.', timeout: 300_000 }, async (t) => {
  const stack = await startStack({ web: true });
  const profile = mkdtempSync(join(tmpdir(), 'wasteworx-chrome-'));
  const browser = await puppeteer.launch({ args: ['--no-first-run'], executablePath: chrome, headless: true, userDataDir: profile });
  t.after(async () => { await browser.close(); await stack.stop(); rmSync(profile, { force: true, recursive: true }); });

  const page = await browser.newPage();
  await page.setViewport({ height: 900, width: 1280 });
  const pageErrors = []; page.on('pageerror', (error) => pageErrors.push(String(error)));

  const mainText = () => page.evaluate(() => document.querySelector('main')?.innerText ?? '');
  const waitForText = (text) => page.waitForFunction((expected) => document.querySelector('main')?.innerText.includes(expected), { timeout: 10_000 }, text);
  const waitForPath = (path) => page.waitForFunction((expected) => location.pathname === expected, { timeout: 10_000 }, path);
  const click = async (label) => {
    const control = (await page.evaluateHandle((text) => [...document.querySelectorAll('button, a')].find((element) => element.innerText.trim() === text), label)).asElement();
    assert.ok(control, `expected a button or link labelled "${label}"`);
    await control.click();
  };
  const fill = async (label, value) => {
    const field = (await page.evaluateHandle((text) => {
      const match = [...document.querySelectorAll('label')].find((element) => element.innerText.trim().startsWith(text));
      return match?.querySelector('input, textarea') ?? match?.parentElement.querySelector('input, textarea');
    }, label)).asElement();
    assert.ok(field, `expected a field labelled "${label}"`);
    await field.click({ clickCount: 3 });
    await field.type(value);
  };
  const signIn = async (person) => {
    await page.goto(`${stack.webUrl}/sign-in`);
    await page.waitForSelector('input[name=email]');
    await page.type('input[name=email]', person.email);
    await page.type('input[name=password]', password);
    await page.click('form button.primary');
    await waitForPath('/admin');
  };

  let editPath;

  await t.test('staff A signs in and saves a draft', async () => {
    await signIn(people.staffA);
    assert.ok((await mainText()).includes(people.staffA.email));
    await click('Businesses'); await waitForText('No businesses yet');
    await click('Register a business'); await waitForText('Business identity');
    await fill('Registered business name', 'Kgale Hardware');
    await click('Save draft'); await waitForPath('/admin/businesses'); await waitForText('Kgale Hardware');
    assert.ok((await mainText()).includes('Continue draft'));
  });

  await t.test('a duplicate name shows a readable message', async () => {
    await click('Register a business'); await waitForText('Business identity');
    await fill('Registered business name', 'Kgale Hardware');
    await click('Save draft');
    await waitForText('A business with this registered name is already registered.');
  });

  await t.test('staff B reopens the draft with its saved data', async () => {
    await click('Sign out'); await waitForPath('/sign-in');
    await signIn(people.staffB);
    await click('Businesses'); await waitForText('Kgale Hardware');
    await click('Continue draft'); await waitForText('Business identity');
    assert.equal(await page.$eval('h1', (heading) => heading.innerText), 'Finish a draft');
    assert.equal(await page.$eval('label input', (input) => input.value), 'Kgale Hardware');
    editPath = await page.evaluate(() => location.pathname);
  });

  await t.test('staff B completes every step and submits', async () => {
    await fill('Business registration number', 'BW-00123'); await fill('Industry', 'Retail'); await click('Continue');
    await fill('Name', 'Neo Kgosi'); await fill('Email', 'neo@example.test'); await fill('Phone number', '+267 71 000 000'); await click('Continue');
    await fill('Site name', 'Main shop'); await fill('Street address', 'Plot 12 Kgale View'); await fill('City', 'Gaborone'); await click('Continue');
    await fill('Document or verification reference', 'Certificate seen'); await click('Continue');
    await waitForText('Review registration');
    const review = await mainText();
    for (const expected of ['Kgale Hardware', 'Neo Kgosi', 'Main shop', 'Certificate seen']) assert.ok(review.includes(expected), `review should show "${expected}"`);
    await click('Submit for verification'); await waitForPath('/admin/businesses'); await waitForText('Submitted');
    assert.ok(!(await mainText()).includes('Continue draft'));
  });

  await t.test('the submitted registration can no longer be edited', async () => {
    await page.goto(`${stack.webUrl}${editPath}`);
    await waitForText('This registration has been submitted and can no longer be edited.');
  });

  assert.deepEqual(pageErrors, []);
});
