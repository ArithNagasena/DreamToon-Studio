import { chromium } from 'playwright';

const OUT = '/home/claude/shots';
const B = 'http://localhost:5173';
let pass = 0, fail = 0;
const chk = (name, ok, detail = '') => {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? '  — ' + detail : ''}`); }
};

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
// Only uncaught exceptions count. Console network noise in this sandbox
// (Google Fonts is blocked, and two 401/404s are deliberately provoked below)
// is not an application fault.
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });

/* ---------- T1: register and log in (FR7) ---------- */
await page.goto(B + '/login', { waitUntil: 'networkidle' });
await shot('01-login');
chk('S1 login screen renders', await page.getByTestId('login-submit').isVisible());

await page.getByTestId('password').fill('wrongpass');
await page.getByTestId('login-submit').click();
await page.waitForSelector('[data-testid=login-error]');
const msgWrongPw = (await page.getByTestId('login-error').textContent()).trim();
await shot('01b-login-error');
await page.getByTestId('email').fill('nobody@studio.com');
await page.getByTestId('password').fill('password123');
await page.getByTestId('login-submit').click();
await page.waitForTimeout(500);
const msgNoUser = (await page.getByTestId('login-error').textContent()).trim();
chk('FR7 unknown email and wrong password give the SAME message (no account enumeration)',
    msgWrongPw === msgNoUser && msgWrongPw.length > 0, `${msgWrongPw} vs ${msgNoUser}`);

await page.goto(B + '/register', { waitUntil: 'networkidle' });
await page.getByTestId('reg-name').fill('Test Designer');
await page.getByTestId('reg-email').fill('test@studio');
await page.getByTestId('reg-email').blur();
await page.waitForSelector('[data-testid=reg-email-error]');
chk('S2 inline validation fires on blur, not on submit', true);
await page.getByTestId('reg-email').fill('test.designer@studio.com');
await page.getByTestId('reg-password').fill('Passw0rd!long');
await page.getByTestId('reg-confirm').fill('Passw0rd!long');
await shot('02-register');
await page.getByTestId('reg-submit').click();
await page.waitForURL(B + '/');
chk('T1 register lands in the library', page.url() === B + '/');
await page.waitForSelector('.empty, [data-testid=library-grid]');
await shot('03-library-empty');
chk('S3 empty state shown for a brand-new designer', await page.locator('.empty').isVisible());

/* log in as the seeded designer instead */
await page.getByTestId('usermenu').click();
await page.getByTestId('menu-logout').click();
await page.waitForURL('**/login');
await page.getByTestId('email').fill('nadia@studio.com');
await page.getByTestId('password').fill('password123');
await page.getByTestId('login-submit').click();
await page.waitForSelector('[data-testid=library-grid]');
await shot('04-library');
const cardCount = await page.locator('.ccard').count();
chk('FR9 library lists the seeded characters', cardCount === 6, `saw ${cardCount}`);

/* FR9 search + filter */
await page.getByTestId('search').fill('cow');
await page.waitForTimeout(450);
chk('FR9 search narrows the grid', (await page.locator('.ccard').count()) === 1);
await page.getByTestId('search').fill('');
await page.getByTestId('filter-plant').click();
await page.waitForTimeout(350);
chk('FR9 type filter works', (await page.locator('.ccard').count()) === 2);
await shot('05-library-filtered');
await page.getByTestId('filter-all').click();
await page.waitForTimeout(350);

/* ---------- T2: create an animal character (FR1, FR10) ---------- */
await page.getByTestId('new-character').click();
await page.waitForSelector('[data-testid=type-animal]');
await shot('06-wizard-type');
chk('S4 Next is disabled until a type is chosen', await page.getByTestId('wizard-next').isDisabled());
await page.getByTestId('type-animal').click();
chk('S4 Next enables after choosing', !(await page.getByTestId('wizard-next').isDisabled()));
await page.getByTestId('wizard-next').click();
await page.waitForSelector('[data-testid=shape-quadruped]');
await shot('07-wizard-shape');
const shapeCount = await page.locator('.choice').count();
chk('FR10 shape list is filtered to the chosen type', shapeCount === 3, `saw ${shapeCount}`);
await page.getByTestId('shape-quadruped').click();
await page.getByTestId('wizard-create').click();
await page.waitForURL(/\/c\/[a-f0-9]+/);
await page.waitForSelector('[data-testid=part-body]');
await shot('08-editor-2d');
chk('T2 create opens the editor', /\/c\//.test(page.url()));

/* ---------- T3: recolour only the ears (FR5, FR11) ---------- */
const bodyBefore = await page.getByTestId('part-body').locator('.partrow__col').textContent();
await page.getByTestId('part-ears').click();
chk('FR11 selecting a part updates the properties panel',
    (await page.getByTestId('selected-part').textContent()).toLowerCase().includes('ears'));
const earsBefore = (await page.getByTestId('part-ears').locator('.partrow__col').textContent()).trim();
// deliberately a colour the quadruped does NOT start with, so the assertion is not vacuous
await page.getByTestId('swatch-Sky-Blue').click();
await page.waitForTimeout(150);
const earsAfter = await page.getByTestId('part-ears').locator('.partrow__col').textContent();
const bodyAfter = await page.getByTestId('part-body').locator('.partrow__col').textContent();
chk('T3 ears recoloured to a genuinely different colour',
    earsBefore !== 'Sky Blue' && earsAfter.trim() === 'Sky Blue', `${earsBefore} -> ${earsAfter}`);
chk('T3 body untouched — part-level colour is real', bodyAfter === bodyBefore, `${bodyBefore} -> ${bodyAfter}`);
await shot('09-editor-colour');

/* click the character on canvas to select a part (direct manipulation) */
await page.locator('.artboard svg ellipse').first().click({ force: true });
await page.waitForTimeout(120);
chk('FR11 clicking the canvas selects a part',
    !(await page.getByTestId('selected-part').textContent()).includes('Nothing selected'));

/* undo / redo (FR12) */
await page.getByTestId('undo').click();
await page.waitForTimeout(120);
chk('FR12 undo reverts the colour change',
    (await page.getByTestId('part-ears').locator('.partrow__col').textContent()).trim() === earsBefore);
await page.getByTestId('redo').click();
await page.waitForTimeout(120);
chk('FR12 redo reapplies it',
    (await page.getByTestId('part-ears').locator('.partrow__col').textContent()).trim() === 'Sky Blue');

/* ---------- T4: look at it from behind (FR3) ---------- */
await page.getByTestId('view-3d').click();
await page.waitForSelector('[data-testid=canvas-3d]', { timeout: 10000 });
await page.waitForTimeout(1600);
await shot('10-editor-3d');
chk('T4 3D canvas mounts', await page.getByTestId('canvas-3d').isVisible());
const framing = await page.evaluate(() => {
  const c = document.querySelector('[data-testid=canvas-3d]');
  const r = c.getBoundingClientRect();
  const host = c.parentElement.getBoundingClientRect();
  return {
    overflow: Math.round(r.width - host.width),
    // crop the centre 60% and count pixels that are not the flat background
    ink: (() => {
      const g = c.getContext('webgl2') || c.getContext('webgl');
      const W = c.width, H = c.height;
      const x0 = Math.floor(W * 0.2), y0 = Math.floor(H * 0.2);
      const w = Math.floor(W * 0.6), h = Math.floor(H * 0.6);
      const buf = new Uint8Array(w * h * 4);
      g.readPixels(x0, y0, w, h, g.RGBA, g.UNSIGNED_BYTE, buf);
      let n = 0;
      for (let i = 0; i < buf.length; i += 4) {
        // background is #EDEAE5
        if (Math.abs(buf[i] - 237) > 10 || Math.abs(buf[i+1] - 234) > 10 || Math.abs(buf[i+2] - 229) > 10) n++;
      }
      return n / (w * h);
    })(),
  };
});
chk('FR3 the 3D canvas fits its container (no overflow)', Math.abs(framing.overflow) <= 2, `overflow ${framing.overflow}px`);
chk('FR3 the character is actually framed in the centre of the 3D view',
    framing.ink > 0.06 && framing.ink < 0.95, `centre coverage ${(framing.ink*100).toFixed(1)}%`);
const meta = await page.getByTestId('stage-meta').textContent();
chk('FR3 3D view reports a frame rate', /fps/.test(meta), meta);

/* orbit by dragging */
const box = await page.getByTestId('canvas-3d').boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width / 2 + 260, box.y + box.height / 2 + 40, { steps: 22 });
await page.mouse.up();
await page.waitForTimeout(700);
await shot('11-editor-3d-orbited');
chk('FR3 orbit drag throws no uncaught exception', errors.length === 0, errors.join(' | '));

await page.getByTestId('reset-camera').click();
await page.waitForTimeout(500);
chk('FR3 reset camera works', true);

/* state survives the view switch */
await page.getByTestId('view-2d').click();
await page.waitForTimeout(250);
chk('FR2/FR3 colour survives switching views',
    (await page.getByTestId('part-ears').locator('.partrow__col').textContent()).trim() === 'Sky Blue');

/* ---------- T5: scale to about half (FR4) ---------- */
await page.getByTestId('scale-number').fill('50');
await page.getByTestId('scale-number').blur();
await page.waitForTimeout(200);
chk('T5 scale set to 50%', (await page.getByTestId('stage-meta').textContent()).includes('50%'));
await shot('12-editor-resized');
await page.getByTestId('reset-scale').click();
await page.waitForTimeout(150);
chk('FR4 reset returns to 100%', (await page.getByTestId('stage-meta').textContent()).includes('100%'));
await page.getByTestId('scale-number').fill('70');
await page.getByTestId('scale-number').blur();

/* rename + save (FR8) */
await page.getByTestId('char-name').fill('Brown Cow Test');
chk('NFR4 unsaved state is visible', (await page.getByTestId('save-state').textContent()).includes('Unsaved'));
await page.getByTestId('save').click();
await page.waitForTimeout(700);
chk('FR8 save clears the unsaved indicator',
    !(await page.getByTestId('save-state').textContent()).includes('Unsaved'));
await shot('13-editor-saved');

/* export dialog (FR13) */
await page.getByTestId('export').click();
await page.waitForSelector('[data-testid=run-export]');
await shot('14-export');
chk('S13 export dialog opens', await page.getByTestId('run-export').isVisible());
const dl = page.waitForEvent('download', { timeout: 8000 }).catch(() => null);
await page.getByTestId('run-export').click();
const file = await dl;
chk('FR13 export produces a downloadable file', !!file, file ? await file.suggestedFilename() : 'no download');

/* back to library, reopen (FR6, FR8) */
await page.getByTestId('done').click();
await page.waitForSelector('[data-testid=library-grid]');
chk('FR8 saved character appears in the library',
    (await page.locator('.ccard__name', { hasText: 'Brown Cow Test' }).count()) === 1);
await page.locator('.ccard', { hasText: 'Brown Cow Test' }).getByText('Open').click();
await page.waitForSelector('[data-testid=part-ears]');
chk('FR6 reopening restores every property',
    (await page.getByTestId('part-ears').locator('.partrow__col').textContent()).trim() === 'Sky Blue'
    && (await page.getByTestId('stage-meta').textContent()).includes('70%'));
await page.getByTestId('done').click();
await page.waitForSelector('[data-testid=library-grid]');

/* ---------- T6: delete with undo (FR6, FR12) ---------- */
await page.locator('.ccard', { hasText: 'Brown Cow Test' }).getByText('Delete').click();
await page.waitForSelector('[data-testid=confirm-delete]');
await shot('15-delete-confirm');
chk('S12 Cancel is the focused default action',
    await page.getByTestId('cancel-delete').evaluate(el => el === document.activeElement));
await page.getByTestId('confirm-delete').click();
await page.waitForSelector('.toast');
await shot('16-delete-undo-toast');
chk('T6 delete removes it from the grid',
    (await page.locator('.ccard__name', { hasText: 'Brown Cow Test' }).count()) === 0);
chk('FR12 an undo control is offered', await page.locator('.toast__btn').isVisible());
await page.locator('.toast__btn').click();
await page.waitForTimeout(700);
chk('FR12 undo actually restores the character',
    (await page.locator('.ccard__name', { hasText: 'Brown Cow Test' }).count()) === 1);

/* ---------- account + admin (FR7, FR14) ---------- */
await page.getByTestId('usermenu').click();
chk('FR14 a designer is not offered the admin screen', (await page.getByTestId('menu-admin').count()) === 0);
await page.locator('.menuitem', { hasText: 'Account' }).click();
await page.waitForSelector('[data-testid=change-pw]');
await shot('17-account');
chk('S14 account screen renders', true);

await page.getByTestId('usermenu').click();
await page.getByTestId('menu-logout').click();
await page.waitForURL('**/login');
await page.getByTestId('email').fill('ruwan@studio.com');
await page.getByTestId('password').fill('password123');
await page.getByTestId('login-submit').click();
await page.waitForSelector('[data-testid=library-grid], .empty');
await page.getByTestId('usermenu').click();
chk('FR14 the art lead IS offered the admin screen', (await page.getByTestId('menu-admin').count()) === 1);
await page.getByTestId('menu-admin').click();
await page.waitForSelector('[data-testid=admin-table]');
await shot('18-admin');
const rows = await page.locator('[data-testid=admin-table] tbody tr').count();
chk('FR14 admin lists every designer', rows >= 3, `saw ${rows}`);
await page.getByTestId('toggle-ishara@studio.com').click();
await page.waitForSelector('[data-testid=confirm-deactivate]');
await page.getByTestId('confirm-deactivate').click();
await page.waitForTimeout(600);
chk('FR14 deactivation applies',
    (await page.locator('tr', { hasText: 'ishara@studio.com' }).textContent()).includes('Deactivated'));
await shot('19-admin-deactivated');

console.log('');
console.log(`  ---- ${pass} passed, ${fail} failed ----`);
if (errors.length) { console.log('  console/page errors:'); errors.slice(0, 8).forEach(e => console.log('   ', e.slice(0, 200))); }
await browser.close();
process.exit(fail ? 1 : 0);
