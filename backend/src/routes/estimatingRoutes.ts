import { Router } from 'express';
import multer from 'multer';
import { authenticate, requireRole } from '../middleware/auth';
import {
  listProjects, getProject, createProject, updateProject, deleteProject,
  addLineItem, updateLineItem, deleteLineItem,
  getMaterialPrices, upsertMaterialPrice,
  uploadEstimateDocument, deleteEstimateDocument,
} from '../controllers/estimatingController';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// Changing estimates and prices is a manager-and-up action; reading is open
// to any signed-in user.
const canEdit = requireRole('admin', 'leadership', 'manager');

// Literal paths come before '/:id' so they are not read as project ids.
router.get('/material-prices',  authenticate, getMaterialPrices);
router.post('/material-prices', authenticate, canEdit, upsertMaterialPrice);

router.get('/',    authenticate, listProjects);
router.post('/',   authenticate, canEdit, createProject);
router.get('/:id', authenticate, getProject);
router.put('/:id', authenticate, canEdit, updateProject);
router.delete('/:id', authenticate, canEdit, deleteProject);

router.post('/:id/line-items',         authenticate, canEdit, addLineItem);
router.put('/:id/line-items/:itemId',  authenticate, canEdit, updateLineItem);
router.delete('/:id/line-items/:itemId', authenticate, canEdit, deleteLineItem);

router.post('/:id/documents', authenticate, canEdit, upload.single('file'), uploadEstimateDocument);
router.delete('/documents/:docId', authenticate, canEdit, deleteEstimateDocument);

export default router;
