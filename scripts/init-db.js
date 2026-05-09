import { initSchema } from '../src/db/db.js';
import { seedGenres, seedSources, seedAffiliates } from '../src/db/seed.js';

console.log('Initialising database...');
initSchema();
console.log('Schema created.');
seedGenres();
console.log('Genres seeded.');
seedSources();
console.log('Sources seeded.');
seedAffiliates();
console.log('Affiliates seeded.');
console.log('Done.');
