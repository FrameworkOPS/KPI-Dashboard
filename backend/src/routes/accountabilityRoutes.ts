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
import { authenticate, requireLeadershipOrAdmin } from '../middleware/auth';

const router = Router();

// 25 MB cap — SOPs/PDFs/small training assets. Bump if larger uploads needed.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

router.get('/', authenticate, getAccountabilityChart);
router.post('/', authenticate, requireLeadershipOrAdmin, createSeat);
router.put('/:id', authenticate, requireLeadershipOrAdmin, updateSeat);
router.delete('/:id', authenticate, requireLeadershipOrAdmin, deleteSeat);

router.get('/:id/documents', authenticate, listSeatDocuments);
router.post('/:id/documents', authenticate, requireLeadershipOrAdmin, upload.single('file'), uploadSeatDocument);
router.get('/documents/:docId/download', authenticate, downloadSeatDocument);
router.delete('/documents/:docId', authenticate, requireLeadershipOrAdmin, deleteSeatDocument);

export default router;
