import AppError from '../utils/appError.js';
import { verifyToken } from '../utils/credentials.js';
import { findUserById } from '../models/authModel.js';

export async function authenticate(req, res, next) {
  const authorization = req.get('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  const tokenUser = token ? verifyToken(token) : null;

  if (!tokenUser) return next(new AppError(401, 'Please sign in with a valid account.'));
  const user = await findUserById(tokenUser.userId);
  if (!user || !user.isActive) return next(new AppError(401, 'Please sign in with an active account.'));
  req.user = user;
  return next();
}

export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return next(new AppError(401, 'Please sign in to continue.'));
    if (!allowedRoles.includes(req.user.role)) {
      return next(new AppError(403, 'Your account does not have permission to do this.'));
    }
    return next();
  };
}
