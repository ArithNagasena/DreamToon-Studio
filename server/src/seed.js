import bcrypt from 'bcryptjs';
import { defaultCharacter, templateFromCharacter, SHAPES } from '../../shared/character.js';

/** Demo data so the application is not empty on first run. SEED=1 to enable. */
export async function seed(repo) {
  if (await repo.users.count()) { console.log('[seed] users already exist — skipping'); return; }

  const hash = await bcrypt.hash('password123', 10);
  const nadia = await repo.users.create({ name: 'Nadia Perera', username: 'nadia', email: 'nadia@studio.com', passwordHash: hash, role: 'designer' });
  const ruwan = await repo.users.create({ name: 'Ruwan Fernando', username: 'ruwan', email: 'ruwan@studio.com', passwordHash: hash, role: 'artlead' });
  await repo.users.create({ name: 'Ishara Silva', username: 'ishara', email: 'ishara@studio.com', passwordHash: hash, role: 'designer' });

  const make = async (owner, shape, name, colors = {}, extra = {}) => {
    const base = defaultCharacter(shape, name);
    await repo.characters.create({ ...base, ...extra, colors: { ...base.colors, ...colors }, owner });
  };

  await make(nadia._id, 'quadruped', 'Brown Cow',    { body: 'Snow', legs: 'Cocoa', ears: 'Blush Pink' });
  await make(nadia._id, 'bird',      'Red Hen',      { body: 'Barn Red', wings: 'Cocoa' });
  await make(nadia._id, 'flower',    'Sunflower',    { petals: 'Corn Yellow', centre: 'Cocoa' });
  await make(nadia._id, 'child',     'Pupil Sam',    { body: 'Sky Blue', hair: 'Charcoal' },
             { variants: { build: 'tall', head: 'narrow', face: 'happy' }, hidden: ['shoes'] });
  await make(nadia._id, 'fish',      'Blue Fish',    { body: 'Sky Blue', fins: 'Meadow Green' });
  await make(nadia._id, 'tree',      'Oak Sapling',  { canopy: 'Meadow Green' });
  await make(ruwan._id, 'adult',     'Farmer Sam',   { body: 'Meadow Green' });

  const tpl = templateFromCharacter(
    { ...defaultCharacter('quadruped'), colors: { ...SHAPES.quadruped.defaults, body: 'Cocoa', head: 'Cocoa' },
      variants: { build: 'round', head: 'round', face: 'happy' } },
    'Studio puppy');
  await repo.templates.create({ ...tpl, blurb: 'the studio house style', owner: nadia._id });

  console.log('[seed] demo accounts: nadia@studio.com (designer) / ruwan@studio.com (art lead) — password123');
}
