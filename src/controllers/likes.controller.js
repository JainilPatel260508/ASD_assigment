import * as likes from '../services/likes.service.js';
import { likeInput, resourceId } from '../utils/validation.js';

export const list = async (req, res) => res.json(await likes.listLikes(resourceId(req.params.id)));
export const create = async (req, res) => {
  const userId = likeInput(req.body);
  res.status(201).json(await likes.createLike(resourceId(req.params.id), userId));
};
export const remove = async (req, res) => {
  await likes.deleteLike(resourceId(req.params.id), resourceId(req.params.userId, 'userId'));
  res.status(204).end();
};
