import { Router } from 'express';
import multer from 'multer';
import {
  getAccountabilityChart,
  createSeat,
  updateSeat,
  deleteSeat,
  listSeatDocuments,
  uploadSeatDocument,
  downloadSeatDocument,
  deleteSeatDocument,
} from '../controllers/accountabilityController';
import { authenticate, requireAdmin } from '../middleware/auth';

const router = Router();

// 25 MB cap — SOPs/PDFs/small training assets. Bump if larger uploads needed.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

// All authenticated users can view the org chart and download attached docs.
// Mutations (seats + documents) are admin-only.
router.get('/', authenticate, getAccountabilityChart);
router.post('/', authenticate, requireAdmin, createSeat);
router.put('/:id', authenticate, requireAdmin, updateSeat);
router.delete('/:id', authenticate, requireAdmin, deleteSeat);

router.get('/:id/documents', authenticate, listSeatDocuments);
router.post('/:id/documents', authenticate, requireAdmin, upload.single('file'), uploadSeatDocument);
router.get('/documents/:docId/download', authenticate, downloadSeatDocument);
router.delete('/documents/:docId', authenticate, requireAdmin, deleteSeatDocument);

export default router;
