import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { connectRepo } from './db/index.js';
import { authRoutes } from './routes/auth.js';
import { characterRoutes } from './routes/characters.js';
import { adminRoutes } from './routes/admin.js';
import { templateRoutes } from './routes/templates.js';
import { seed } from './seed.js';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({ origin: process.env.CLIENT_ORIGIN || true }));
app.use(express.json({ limit: '1mb' }));   // a profile picture rides in the body

const repo = await connectRepo();
if (process.env.SEED === '1') await seed(repo);

app.get('/api/health', (_req, res) =>
  res.json({ ok: true, storage: repo.kind, time: new Date().toISOString() }));

app.use('/api/auth', authRoutes(repo));
app.use('/api/characters', characterRoutes(repo));
app.use('/api/admin', adminRoutes(repo));
app.use('/api/templates', templateRoutes(repo));

app.use('/api', (_req, res) => res.status(404).json({ error: 'No such endpoint.' }));

app.use((err, _req, res, _next) => {
  console.error('[error]', err);
  res.status(500).json({ error: 'Something went wrong on our side. Your work is saved locally.' });
});

app.listen(PORT, () => console.log(`[server] http://localhost:${PORT}  (storage: ${repo.kind})`));
