import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { initializeDatabase, pool } from './config/database';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

import authRoutes from './routes/authRoutes';
import scorecardRoutes from './routes/scorecardRoutes';
import rocksRoutes from './routes/rocksRoutes';
import issuesRoutes from './routes/issuesRoutes';
import todosRoutes from './routes/todosRoutes';
import vtoRoutes from './routes/vtoRoutes';
import accountabilityRoutes from './routes/accountabilityRoutes';
import meetingsRoutes from './routes/meetingsRoutes';
import integrationRoutes from './routes/integrationRoutes';

const app = express();
const PORT = parseInt(process.env.PORT || '5001', 10);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable for SPA
  crossOriginEmbedderPolicy: false,
}));

// CORS
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:5173,http://localhost:5001')
  .split(',')
  .map((o) => o.trim());

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin ${origin} not allowed`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
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
app.use('/api/scorecard', scorecardRoutes);
app.use('/api/rocks', rocksRoutes);
app.use('/api/issues', issuesRoutes);
app.use('/api/todos', todosRoutes);
app.use('/api/vto', vtoRoutes);
app.use('/api/accountability', accountabilityRoutes);
app.use('/api/meetings', meetingsRoutes);
app.use('/api/integrations', integrationRoutes);

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
  try {
    await initializeDatabase();
    console.log('Database initialized');

    const server = app.listen(PORT, () => {
      console.log(`KPI Dashboard backend running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      console.log(`\n${signal} received — shutting down gracefully`);
      server.close(async () => {
        await pool.end();
        console.log('Database pool closed');
        process.exit(0);
      });
      // Force exit after 10 seconds
      setTimeout(() => {
        console.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();

export default app;
