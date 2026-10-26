import { Router } from 'express';
import * as likes from '../controllers/likes.controller.js';

const router = Router({ mergeParams: true });
router.get('/', likes.list);
router.post('/', likes.create);
router.delete('/:userId', likes.remove);
export default router;
