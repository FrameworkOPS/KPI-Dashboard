import { Router, Response, NextFunction } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { chatWithSky, isForecasterAiConfigured, ChatMessage } from '../services/forecasterAiService';

const router = Router();

router.get('/status', authenticate, (_req: AuthRequest, res: Response) => {
  res.json({ enabled: isForecasterAiConfigured() });
});

router.post('/chat', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const messages: ChatMessage[] = Array.isArray(req.body?.messages) ? req.body.messages : [];
    if (!messages.length) {
      res.status(400).json({ error: 'messages array is required' });
      return;
    }
    const trimmed = messages.slice(-30).map((m) => ({
      role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
      content: String(m.content || '').slice(0, 8000),
    }));
    const result = await chatWithSky(trimmed, req.user?.id || null);
    res.json({ success: true, data: result });
  } catch (err) {
    const e = err as any;
    if (e?.status === 401) {
      res.status(503).json({ error: 'AI authentication failed. Check ANTHROPIC_API_KEY on the server.' });
      return;
    }
    next(err);
  }
});

export default router;
