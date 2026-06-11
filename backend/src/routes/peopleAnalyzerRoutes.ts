import { Router } from 'express';
import {
  listCoreValues, createCoreValue, updateCoreValue, deleteCoreValue,
  listAnalyzerForQuarter, upsertAnalyzerEntry, deleteAnalyzerEntry,
} from '../controllers/peopleAnalyzerController';
import { authenticate, requireAdmin } from '../middleware/auth';

const router = Router();

// All endpoints are admin-only — People Analyzer is sensitive HR data.
router.get('/core-values',          authenticate, requireAdmin, listCoreValues);
router.post('/core-values',         authenticate, requireAdmin, createCoreValue);
router.put('/core-values/:id',      authenticate, requireAdmin, updateCoreValue);
router.delete('/core-values/:id',   authenticate, requireAdmin, deleteCoreValue);

router.get('/entries',              authenticate, requireAdmin, listAnalyzerForQuarter);
router.post('/entries',             authenticate, requireAdmin, upsertAnalyzerEntry);
router.delete('/entries/:id',       authenticate, requireAdmin, deleteAnalyzerEntry);

export default router;
