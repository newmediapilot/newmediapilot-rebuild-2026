// Real-browser regression test for the contact form. Run against the live site with
// `npm run test:form`, or point FORM_TEST_URL at a local/preview build first.
// Exercises the actual client JS, the CORS preflight, and the Lambda round trip.
// NOTE: the valid-submission case sends a real email to the contact address.
import { chromium } from 'playwright';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const URL = process.env.FORM_TEST_URL || 'https://newmediapilot.com';
const results = [];

const record = (name, pass, detail) => {
    results.push({ name, pass, detail });
    console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();

const consoleErrors = [];
const failedRequests = [];
page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('requestfailed', (r) => failedRequests.push(`${r.method()} ${r.url()} :: ${r.failure()?.errorText}`));

await page.goto(URL, { waitUntil: 'networkidle' });
record('page loads', true, await page.title());

// --- 1. open the modal ---
await page.locator('[data-open-contact]').first().click();
await page.locator('#contact[data-open], dialog#contact[open]').first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
const isOpen = await page.evaluate(() => document.getElementById('contact')?.open === true);
record('modal opens', isOpen);

// --- 2. empty submit is stopped by NATIVE validation, so the submit handler never
//        runs. Assert on the absence of a request, not on our status text.
let emptyRequest = null;
page.on('request', (r) => {
    if (r.url().includes('lambda-url')) emptyRequest = r;
});
await page.locator('[data-contact-submit]').click();
await page.waitForTimeout(700);
const validEmpty = await page.evaluate(() => document.querySelector('[data-contact-form]').checkValidity());
record('empty submit blocked natively', validEmpty === false, `checkValidity=${validEmpty}`);
record('empty submit sent nothing', emptyRequest === null);

// --- 3. the real thing: fill and send ---
await page.fill('#contact-name', 'Playwright browser test');
await page.fill('#contact-email', 'marcin@newmediapilot.com');
await page.fill('#contact-number', '5551234');
await page.fill('#contact-message', 'Sent from a real headless browser to verify the CORS preflight and SES path.');

const [response] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('lambda-url'), { timeout: 30000 }).catch(() => null),
    page.locator('[data-contact-submit]').click(),
]);

record('lambda responded', !!response, response ? `${response.status()} ${response.request().method()}` : 'no response seen');

await page
    .locator('[data-contact-status][data-state="success"]')
    .waitFor({ timeout: 15000 })
    .catch(() => {});

const finalState = await page.getAttribute('[data-contact-status]', 'data-state');
const finalText = (await page.textContent('[data-contact-status]'))?.trim();
record('success state shown', finalState === 'success', `data-state=${finalState} text="${finalText}"`);

const nameAfter = await page.inputValue('#contact-name');
record('form reset after send', nameAfter === '', `name field="${nameAfter}"`);

const btnDisabled = await page.getAttribute('[data-contact-submit]', 'disabled');
record('button re-enabled', btnDisabled === null);

// --- 4. honeypot: run on a FRESH page so no leftover state can fake a pass.
//     The bot fills the off-screen field; Lambda must answer 200 without sending.
const bot = await ctx.newPage();
await bot.goto(URL, { waitUntil: 'networkidle' });
await bot.locator('[data-open-contact]').first().click();
await bot.waitForTimeout(300);
await bot.fill('#contact-name', 'Bot attempt');
await bot.fill('#contact-email', 'bot@spam.example');
await bot.fill('#contact-number', '5550000');
await bot.fill('#contact-message', 'buy now');
const botValid = await bot.evaluate(() => document.querySelector('[data-contact-form]').checkValidity());
record('bot form is valid (so only the honeypot can stop it)', botValid === true, `checkValidity=${botValid}`);
await bot.evaluate(() => {
    const hp = document.getElementById('contact-website');
    hp.value = 'http://spam.example';
});

const [hpRes] = await Promise.all([
    bot.waitForResponse((r) => r.url().includes('lambda-url'), { timeout: 30000 }).catch(() => null),
    bot.locator('[data-contact-submit]').click(),
]);
await bot.waitForTimeout(500);
const hpState = await bot.getAttribute('[data-contact-status]', 'data-state');
const hpText = (await bot.textContent('[data-contact-status]'))?.trim();
record('honeypot answered 200', hpRes?.status() === 200, `status=${hpRes?.status()}`);
record('honeypot shows success (silently dropped)', hpState === 'success', `data-state=${hpState} text="${hpText}"`);

console.log('\n  console errors :', consoleErrors.length ? consoleErrors.join(' | ') : 'none');
console.log('  failed requests:', failedRequests.length ? failedRequests.join(' | ') : 'none');

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n  ${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
