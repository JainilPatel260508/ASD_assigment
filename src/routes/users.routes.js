import { Router } from 'express';
import * as users from '../controllers/users.controller.js';

const router = Router();
router.post('/', users.create);
router.get('/', users.list);
router.get('/:id/posts', users.posts);
router.get('/:id/liked-posts', users.likedPosts);
router.get('/:id', users.getOne);
router.patch('/:id', users.update);
router.delete('/:id', users.remove);
export default router;
