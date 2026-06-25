import { Router, Response, NextFunction } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { chatWithForecaster, isForecasterAiConfigured, ChatMessage } from '../services/forecasterAiService';
import { getJnPipelineSummary, getForecasterSettings, updateForecasterSettings } from '../services/jnPipelineService';

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
    const result = await chatWithForecaster(trimmed);
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

export default router;
