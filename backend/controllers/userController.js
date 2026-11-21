import * as authModel from '../models/authModel.js';
import * as userModel from '../models/userModel.js';
import AppError from '../utils/appError.js';
import { hashPassword } from '../utils/credentials.js';
import { getPagination, pagination } from '../utils/pagination.js';
import { positiveId, requiredText } from '../utils/validation.js';

const roles = ['admin', 'sales'];

function validRole(value) {
  if (!roles.includes(value)) throw new AppError(400, 'Role must be admin or sales.');
  return value;
}

function validPassword(value) {
  if (typeof value !== 'string' || value.length < 8 || value.length > 128) {
    throw new AppError(400, 'Password must be between 8 and 128 characters.');
  }
  return value;
}

function validateUser(body, partial = false) {
  const user = {};
  if (!partial || body.fullName !== undefined) {
    user.fullName = requiredText(body.fullName, 'Full name', 120);
  }
  if (!partial || body.username !== undefined) {
    user.username = requiredText(body.username, 'Username', 60);
  }
  if (!partial || body.password !== undefined) {
    user.password = validPassword(body.password);
  }
  if (!partial || body.role !== undefined) user.role = validRole(body.role);
  if (partial && body.isActive !== undefined) {
    if (typeof body.isActive !== 'boolean') throw new AppError(400, 'Active status must be true or false.');
    user.isActive = body.isActive;
  }
  return user;
}

export async function list(req, res) {
  const paging = getPagination(req.query);
  const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 120) : '';
  const { items, totalItems } = await userModel.listUsers({ ...paging, search });
  res.json({ items, pagination: pagination(paging.page, paging.limit, totalItems) });
}

export async function create(req, res) {
  const user = validateUser(req.body);
  const userId = await userModel.createUser({
    fullName: user.fullName,
    username: user.username,
    passwordHash: await hashPassword(user.password),
    role: user.role,
  });
  res.status(201).json({ userId, message: 'User account created.' });
}

export async function update(req, res) {
  const userId = positiveId(req.params.id, 'User ID');
  const user = validateUser(req.body, true);
  if (user.password !== undefined) user.passwordHash = await hashPassword(user.password);
  delete user.password;
  if (!Object.keys(user).length) throw new AppError(400, 'Provide at least one user field to update.');
  if (userId === req.user.userId && (user.role && user.role !== req.user.role || user.isActive === false)) {
    throw new AppError(400, 'You cannot change your own role or deactivate your own account.');
  }
  if (!(await userModel.updateUser(userId, user))) throw new AppError(404, 'User account not found.');
  const updatedUser = await authModel.findUserById(userId);
  res.json({
    message: 'User account updated.',
    user: {
      userId: updatedUser.userId,
      fullName: updatedUser.fullName,
      username: updatedUser.username,
      role: updatedUser.role,
      isActive: Boolean(updatedUser.isActive),
    },
  });
}
