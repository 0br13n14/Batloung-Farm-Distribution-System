import { findUserByUsername } from '../models/authModel.js';
import AppError from '../utils/appError.js';
import { signToken, verifyPassword } from '../utils/credentials.js';
import { requiredText } from '../utils/validation.js';

export async function login(req, res) {
  const username = requiredText(req.body.username, 'Username', 60);
  if (typeof req.body.password !== 'string' || !req.body.password) {
    throw new AppError(400, 'Password is required.');
  }
  const account = await findUserByUsername(username);
  const valid = account?.isActive && await verifyPassword(req.body.password, account.passwordHash);
  if (!valid) throw new AppError(401, 'Username or password is incorrect.');
  const user = {
    userId: account.userId,
    username: account.username,
    fullName: account.fullName,
    role: account.role,
  };
  res.json({ token: signToken(user), user });
}

export function me(req, res) {
  const { userId, username, fullName, role } = req.user;
  res.json({ user: { userId, username, fullName, role } });
}
