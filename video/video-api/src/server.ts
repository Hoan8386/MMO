import path from 'node:path';
import express from 'express';
import { config } from './config';
import apiRoutes from './routes';

const app = express();
const dashboardDir = path.resolve(process.cwd(), 'dashboard');

app.use(express.json({ limit: '2mb' }));
app.use('/api', apiRoutes);
app.use('/renders', express.static(path.join(config.projectDir, 'renders')));
app.use(express.static(dashboardDir));
app.get('/{*splat}', (_req, res) => res.sendFile(path.join(dashboardDir, 'index.html')));

app.listen(config.port, () => {
  console.log(`Video API listening on http://localhost:${config.port}`);
});

export default app;