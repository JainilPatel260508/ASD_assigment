import * as users from '../services/users.service.js';
import { userPosts } from '../services/posts.service.js';
import { resourceId, userInput } from '../utils/validation.js';

export const create = async (req, res) => res.status(201).json(await users.createUser(userInput(req.body, true)));
export const list = async (req, res) => res.json(await users.listUsers(req.query));
export const getOne = async (req, res) => res.json(await users.getUserById(resourceId(req.params.id)));
export const update = async (req, res) => res.json(await users.updateUser(resourceId(req.params.id), userInput(req.body)));
export const remove = async (req, res) => {
  await users.deleteUser(resourceId(req.params.id));
  res.status(204).end();
};
export const posts = async (req, res) => res.json(await userPosts(resourceId(req.params.id), req.query));
export const likedPosts = async (req, res) => res.json(await userPosts(resourceId(req.params.id), req.query, true));
