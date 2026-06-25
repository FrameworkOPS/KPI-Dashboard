import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import path from 'path';
import { initializeDatabase, pool } from './config/database';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { startJobNimbusAutoSync } from './services/jobNimbusService';

import authRoutes from './routes/authRoutes';
import userRoutes from './routes/userRoutes';
import scorecardRoutes from './routes/scorecardRoutes';
import rocksRoutes from './routes/rocksRoutes';
import issuesRoutes from './routes/issuesRoutes';
import todosRoutes from './routes/todosRoutes';
import vtoRoutes from './routes/vtoRoutes';
import accountabilityRoutes from './routes/accountabilityRoutes';
import meetingsRoutes from './routes/meetingsRoutes';
import integrationRoutes from './routes/integrationRoutes';
import peopleAnalyzerRoutes from './routes/peopleAnalyzerRoutes';
import crewsRoutes from './routes/crewsRoutes';
import crewStaffRoutes from './routes/crewStaffRoutes';
import customProjectsRoutes from './routes/customProjectsRoutes';
import forecastRoutes from './routes/forecastRoutes';
import salesForecastRoutes from './routes/salesForecastRoutes';
import pipelineRoutes from './routes/pipelineRoutes';
import metricsRoutes from './routes/metricsRoutes';
import estimatingRoutes from './routes/estimatingRoutes';

const app = express();
const PORT = parseInt(process.env.PORT || '5001', 10);

// CORS — allow all origins (must run before helmet)
app.use((req: Request, res: Response, next: NextFunction) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  next();
});

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: false,
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check (no auth required)
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/scorecard', scorecardRoutes);
app.use('/api/rocks', rocksRoutes);
app.use('/api/issues', issuesRoutes);
app.use('/api/todos', todosRoutes);
app.use('/api/vto', vtoRoutes);
app.use('/api/accountability', accountabilityRoutes);
app.use('/api/meetings', meetingsRoutes);
app.use('/api/integrations', integrationRoutes);
app.use('/api/people-analyzer', peopleAnalyzerRoutes);
app.use('/api/crews', crewsRoutes);
app.use('/api/crew-staff', crewStaffRoutes);
app.use('/api/custom-projects', customProjectsRoutes);
app.use('/api/forecasts', forecastRoutes);
app.use('/api/sales-forecast', salesForecastRoutes);
app.use('/api/pipeline', pipelineRoutes);
app.use('/api/metrics', metricsRoutes);
app.use('/api/estimating', estimatingRoutes);

// Serve frontend static files
const frontendDist = path.join(__dirname, '../../frontend/dist');
app.use(express.static(frontendDist));

// SPA fallback — serve index.html for any non-API route
app.get(/^(?!\/api).*$/, (_req, res) => {
  res.sendFile(path.join(frontendDist, 'index.html'));
});

// 404 for unmatched API routes
app.use('/api', notFoundHandler);

// Global error handler
app.use(errorHandler);

// Start server
async function start(): Promise<void> {
  // Try to connect to DB but don't crash if unavailable — Railway may need a moment
  try {
    await initializeDatabase();
    console.log('✅ Database initialized');
    // Begin pulling JobNimbus data directly from their API (replaces Zapier push).
    startJobNimbusAutoSync();
  } catch (dbErr) {
    console.warn('⚠️  Database connection failed — server will start anyway.');
    console.warn('⚠️  Set DATABASE_URL env var and redeploy to enable database features.');
    console.warn('⚠️  Error:', (dbErr as Error).message);
  }

  const server = app.listen(PORT, () => {
    console.log(`✅ KPI Dashboard running on port ${PORT}`);
    console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received — shutting down gracefully`);
    server.close(async () => {
      await pool.end();
      console.log('Database pool closed');
      process.exit(0);
    });
    setTimeout(() => {
      console.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start();

export default app;
