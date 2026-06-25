import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth';
import {
  listProjects, getProject, createProject, updateProject, deleteProject,
  addLineItem, updateLineItem, deleteLineItem,
  getMaterialPrices, upsertMaterialPrice,
  uploadEstimateDocument, deleteEstimateDocument,
} from '../controllers/estimatingController';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.get('/',    authenticate, listProjects);
router.post('/',   authenticate, createProject);
router.get('/:id', authenticate, getProject);
router.put('/:id', authenticate, updateProject);
router.delete('/:id', authenticate, deleteProject);

router.post('/:id/line-items',         authenticate, addLineItem);
router.put('/:id/line-items/:itemId',  authenticate, updateLineItem);
router.delete('/:id/line-items/:itemId', authenticate, deleteLineItem);

router.post('/:id/documents', authenticate, upload.single('file'), uploadEstimateDocument);
router.delete('/documents/:docId', authenticate, deleteEstimateDocument);

router.get('/material-prices',  authenticate, getMaterialPrices);
router.post('/material-prices', authenticate, upsertMaterialPrice);

export default router;
