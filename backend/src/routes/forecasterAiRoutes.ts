import { Router, Response, NextFunction } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { chatWithForecaster, isForecasterAiConfigured, ChatMessage } from '../services/forecasterAiService';
import {
  getJnPipelineSummary,
  getForecasterSettings,
  updateForecasterSettings,
  listSalesRepCloseRates,
  upsertSalesRepCloseRate,
  deleteSalesRepCloseRate,
} from '../services/jnPipelineService';

const router = Router();

// Live JobNimbus pipeline summary — read-only, anyone authenticated can view
router.get('/jn-pipeline', authenticate, async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const summary = await getJnPipelineSummary();
    res.json({ success: true, data: summary });
  } catch (err) { next(err); }
});

// Forecaster settings — read/write
router.get('/settings', authenticate, async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, data: await getForecasterSettings() });
  } catch (err) { next(err); }
});

router.put('/settings', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const role = req.user?.role;
    if (role !== 'admin' && role !== 'leadership') {
      res.status(403).json({ error: 'Admin or leadership only' });
      return;
    }
    const updated = await updateForecasterSettings(req.body || {});
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

// AI chat status — does the server have ANTHROPIC_API_KEY?
router.get('/status', authenticate, (_req: AuthRequest, res: Response) => {
  res.json({ enabled: isForecasterAiConfigured() });
});

// Chat with the Forecaster AI — POST { messages: [{role, content}, ...] }
router.post('/chat', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const messages: ChatMessage[] = Array.isArray(req.body?.messages) ? req.body.messages : [];
    if (!messages.length) {
      res.status(400).json({ error: 'messages array is required' });
      return;
    }
    // Trim oversized history (most recent 30 turns)
    const trimmed = messages.slice(-30).map((m) => ({
      role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
      content: String(m.content || '').slice(0, 8000),
    }));
    const result = await chatWithForecaster(trimmed, req.user?.id || null);
    res.json({ success: true, data: result });
  } catch (err) {
    const e = err as any;
    if (e?.status === 401) {
      res.status(503).json({ error: 'AI authentication failed — check ANTHROPIC_API_KEY on the server' });
      return;
    }
    next(err);
  }
});

// ── Sales-rep close-rate overrides ────────────────────────────────────────────

router.get('/sales-rep-rates', authenticate, async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const rates = await listSalesRepCloseRates();
    res.json({ success: true, data: rates });
  } catch (err) { next(err); }
});

router.put('/sales-rep-rates', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const role = req.user?.role;
    if (role !== 'admin' && role !== 'leadership') {
      res.status(403).json({ error: 'Admin or leadership only' });
      return;
    }
    const { sales_rep_name, close_rate, notes } = req.body || {};
    if (!sales_rep_name || close_rate === undefined) {
      res.status(400).json({ error: 'sales_rep_name and close_rate are required' });
      return;
    }
    const result = await upsertSalesRepCloseRate(sales_rep_name, Number(close_rate), notes ?? null, req.user?.id || null);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

router.delete('/sales-rep-rates/:repName', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const role = req.user?.role;
    if (role !== 'admin' && role !== 'leadership') {
      res.status(403).json({ error: 'Admin or leadership only' });
      return;
    }
    const ok = await deleteSalesRepCloseRate(String(req.params.repName));
    res.json({ success: ok });
  } catch (err) { next(err); }
});

export default router;
