import { createMemoryRepo } from './memoryRepo.js';
import { createMongoRepo } from './mongoRepo.js';

export async function connectRepo() {
  const useMemory = process.env.DEV_MEMORY_DB === '1';
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/character-designer';

  if (useMemory) {
    console.log('[db] DEV_MEMORY_DB=1 — using the in-memory store (data is lost on restart)');
    return createMemoryRepo().connect();
  }
  try {
    const repo = await createMongoRepo(uri).connect();
    console.log('[db] connected to MongoDB at', uri.replace(/\/\/[^@]*@/, '//***@'));
    return repo;
  } catch (err) {
    console.error('[db] could not reach MongoDB:', err.message);
    console.error('[db] start mongod, set MONGODB_URI, or run with DEV_MEMORY_DB=1 to use the in-memory store.');
    process.exit(1);
  }
}
