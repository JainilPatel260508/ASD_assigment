import { Router } from 'express';
import * as posts from '../controllers/posts.controller.js';

const router = Router();
router.post('/', posts.create);
router.get('/', posts.list);
router.get('/:id', posts.getOne);
router.patch('/:id', posts.update);
router.delete('/:id', posts.remove);
export default router;
