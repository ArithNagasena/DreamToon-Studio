/**
 * API checks for the features added on top of the original coursework build:
 * usernames and profiles, templates, shape variants, optional parts, custom
 * hex colours and searching by creation date.
 *
 * Written in Node rather than shell so it runs on Windows as well as the
 * Linux sandbox — apitest.sh still covers the original surface.
 *
 *   node --run start   (or: DEV_MEMORY_DB=1 SEED=1 npm run dev)
 *   node featuretest.mjs [baseUrl]
 */
const BASE = (process.argv[2] || 'http://localhost:4000') + '/api';

let pass = 0, fail = 0;
const chk = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`}`);
  ok ? pass++ : fail++;
};

let token = null;
async function call(path, { method = 'GET', body, raw = false, auth = true } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(auth && token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (raw) return res.status;
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ...data };
}

const today = new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

async function main() {
  /* ---------------- accounts: usernames and profiles ---------------- */
  console.log('\nAccounts');
  token = (await call('/auth/login', { method: 'POST', auth: false, body: { identifier: 'nadia', password: 'password123' } })).token;
  chk('sign in with a username', typeof token, 'string');

  const byEmail = await call('/auth/login', { method: 'POST', auth: false, body: { identifier: 'nadia@studio.com', password: 'password123' } });
  chk('sign in with an email', byEmail.status, 200);
  chk('the legacy email field still works', (await call('/auth/login', { method: 'POST', auth: false, body: { email: 'nadia@studio.com', password: 'password123' } })).status, 200);
  chk('a wrong password is still rejected', await call('/auth/login', { method: 'POST', auth: false, raw: true, body: { identifier: 'nadia', password: 'nope' } }), 401);

  const me = await call('/auth/me');
  chk('the profile carries a username', me.user.username, 'nadia');
  chk('the profile counts saved characters', me.stats.characterCount, 6);
  chk('the profile counts saved templates', me.stats.templateCount, 1);

  const renamed = await call('/auth/profile', { method: 'PATCH', body: { name: 'Nadia S. Perera' } });
  chk('the display name can be changed', renamed.user.name, 'Nadia S. Perera');
  chk('a taken username is refused', (await call('/auth/profile', { method: 'PATCH', body: { username: 'ruwan' } })).errors?.username != null, true);
  chk('a malformed username is refused', (await call('/auth/profile', { method: 'PATCH', body: { username: 'no' } })).errors?.username != null, true);

  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  chk('a profile picture is accepted', (await call('/auth/profile', { method: 'PATCH', body: { avatar: png } })).user.avatar, png);
  chk('a profile picture can be removed', (await call('/auth/profile', { method: 'PATCH', body: { avatar: null } })).user.avatar, null);
  chk('a non-image profile picture is refused', (await call('/auth/profile', { method: 'PATCH', body: { avatar: 'data:text/html,<script>' } })).errors?.avatar != null, true);

  /* ---------------- shape variants and optional parts ---------------- */
  console.log('\nShape variants and optional parts');
  const cat = await call('/characters/catalogue');
  const child = cat.shapes.find(s => s.key === 'child');
  chk('the catalogue publishes the variant axes', Object.keys(child.variants).sort(), ['build', 'face', 'head']);
  chk('the catalogue publishes the optional parts', child.optional, ['hair', 'shoes']);
  chk('the catalogue publishes the colour groups', Object.keys(child.groups), ['Skin', 'Hair', 'Clothes', 'Eyes']);
  chk('the catalogue publishes both 2D poses', cat.poses.map(p => p.key), ['front', 'side']);

  const made = await call('/characters', { method: 'POST', body: { shape: 'child', name: 'Variant Test' } });
  const id = made.character._id;
  chk('a new character starts on every axis default', made.character.variants, { build: 'regular', head: 'round', face: 'neutral' });
  chk('a new character hides nothing', made.character.hidden, []);

  const shaped = await call(`/characters/${id}`, { method: 'PUT', body: { variants: { build: 'sturdy', head: 'square', face: 'stern' }, hidden: ['hair'] } });
  chk('variants are saved', shaped.character.variants, { build: 'sturdy', head: 'square', face: 'stern' });
  chk('a switched-off part is saved', shaped.character.hidden, ['hair']);
  chk('variants survive a reload', (await call(`/characters/${id}`)).character.variants.head, 'square');

  const bogus = await call(`/characters/${id}`, { method: 'PUT', body: { variants: { build: 'banana' } } });
  chk('an unknown variant falls back rather than failing', bogus.character.variants.build, 'regular');
  const notOptional = await call(`/characters/${id}`, { method: 'PUT', body: { hidden: ['head'] } });
  chk('a required part cannot be switched off', notOptional.character.hidden, []);

  chk('the export states the shape choices', (await call(`/characters/${id}/export?format=json`)).variants.face, 'stern');

  /* ---------------- colours ---------------- */
  console.log('\nColours');
  const eyes = await call(`/characters/${id}`, { method: 'PUT', body: { colors: { eyes: 'Deep Sea' } } });
  chk('eyes are a colourable part', eyes.character.colors.eyes, 'Deep Sea');
  const hex = await call(`/characters/${id}`, { method: 'PUT', body: { colors: { body: '#1F6FEB' } } });
  chk('a custom hex colour is accepted', hex.character.colors.body, '#1f6feb');
  chk('a colour that is neither is refused', await call(`/characters/${id}`, { method: 'PUT', raw: true, body: { colors: { body: 'Neon Puce' } } }), 400);
  chk('a malformed hex is refused', await call(`/characters/${id}`, { method: 'PUT', raw: true, body: { colors: { body: '#12345' } } }), 400);
  const elHex = await call(`/characters/${id}`, { method: 'PUT', body: { elements: [{ id: 'h1', el: 'star', color: '#ABCDEF' }] } });
  chk('an element takes a custom hex too', elHex.character.elements[0].color, '#abcdef');

  /* ---------------- templates ---------------- */
  console.log('\nTemplates');
  const list = await call('/templates');
  chk('built-in templates are published', list.templates.filter(t => t.builtIn).length, 11);
  chk('the seeded personal template is listed', list.templates.filter(t => !t.builtIn).length, 1);
  chk('templates can be filtered by type', (await call('/templates?type=plant')).templates.every(t => t.type === 'plant'), true);

  const fromTemplate = await call('/characters', { method: 'POST', body: { template: 'rabbit', name: 'Bun' } });
  chk('a character can be created from a template', fromTemplate.character.shape, 'quadruped');
  chk('the template carries its variants across', fromTemplate.character.variants, { build: 'slim', head: 'tall', face: 'surprised' });
  chk('the template carries its switched-off parts across', fromTemplate.character.hidden, ['hooves']);
  chk('an unknown template is refused', await call('/characters', { method: 'POST', raw: true, body: { template: 'unicorn' } }), 400);

  const saved = await call('/templates', { method: 'POST', body: { characterId: id, name: 'My stern child', blurb: 'test' } });
  chk('a character can be saved as a template', saved.template.name, 'My stern child');
  chk('a saved template keeps the shape choices', saved.template.variants.face, 'stern');
  chk('a saved template appears in the gallery', (await call('/templates')).templates.some(t => t.key === saved.template.key), true);

  const reused = await call('/characters', { method: 'POST', body: { template: saved.template.key, name: 'Reused' } });
  chk('a saved template can start a character', reused.character.variants.face, 'stern');
  chk('a template needs a name', await call('/templates', { method: 'POST', raw: true, body: { shape: 'child' } }), 400);

  chk('a template can be deleted', (await call(`/templates/${saved.template._id}`, { method: 'DELETE' })).ok, true);
  chk('deleting it twice is a 404', await call(`/templates/${saved.template._id}`, { method: 'DELETE', raw: true }), 404);

  /* ---------------- searching by creation date ---------------- */
  console.log('\nSearching by creation date');
  const all = (await call('/characters')).total;
  chk('everything was created today', (await call(`/characters?createdFrom=${today}&createdTo=${today}`)).total, all);
  chk('an old window finds nothing', (await call('/characters?createdFrom=2020-01-01&createdTo=2020-12-31')).total, 0);
  chk('an open-ended start bound works', (await call(`/characters?createdFrom=${daysAgo(7)}`)).total, all);
  chk('a future start bound finds nothing', (await call('/characters?createdFrom=2099-01-01')).total, 0);
  chk('a malformed date is refused', await call('/characters?createdFrom=yesterday', { raw: true }), 400);

  const newest = (await call('/characters?sort=created')).items;
  const oldest = (await call('/characters?sort=oldest')).items;
  chk('newest-first and oldest-first are opposites', newest.at(0)._id, oldest.at(-1)._id);
  chk('sorting by name still works', (await call('/characters?sort=name')).items.map(i => i.name).every((n, i, a) => i === 0 || a[i - 1].localeCompare(n) <= 0), true);
  chk('a search term is treated as text, not a pattern', (await call('/characters?q=.*')).total, 0);

  /* ---------------- ownership still holds ---------------- */
  console.log('\nOwnership');
  const ruwanToken = (await call('/auth/login', { method: 'POST', auth: false, body: { identifier: 'ruwan', password: 'password123' } })).token;
  const mine = token; token = ruwanToken;
  chk("another designer's template is not listed", (await call('/templates')).templates.some(t => !t.builtIn), false);
  chk("another designer's template cannot be used", await call('/characters', { method: 'POST', raw: true, body: { template: `user:${saved.template._id}` } }), 400);
  token = mine;

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('\nSuite could not run:', e.message); process.exit(2); });
