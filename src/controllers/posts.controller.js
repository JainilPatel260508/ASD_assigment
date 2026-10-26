import * as posts from '../services/posts.service.js';
import { resourceId, postInput } from '../utils/validation.js';

export const create = async (req, res) => res.status(201).json(await posts.createPost(postInput(req.body, true)));
export const list = async (req, res) => res.json(await posts.listPosts(req.query));
export const getOne = async (req, res) => res.json(await posts.getPostById(resourceId(req.params.id)));
export const update = async (req, res) => res.json(await posts.updatePost(resourceId(req.params.id), postInput(req.body)));
export const remove = async (req, res) => {
  await posts.deletePost(resourceId(req.params.id));
  res.status(204).end();
};
