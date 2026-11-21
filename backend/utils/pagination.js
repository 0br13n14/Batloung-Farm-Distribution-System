import AppError from './appError.js';

export function getPagination(query) {
  const page = query.page === undefined ? 1 : Number(query.page);
  const limit = query.limit === undefined ? 10 : Number(query.limit);
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1) {
    throw new AppError(400, 'Page and limit must be positive whole numbers.');
  }
  const safeLimit = Math.min(limit, 100);
  const offset = (page - 1) * safeLimit;
  if (!Number.isSafeInteger(offset)) throw new AppError(400, 'Page is outside the supported range.');
  return { page, limit: safeLimit, offset };
}

export function pagination(page, limit, totalItems) {
  return { page, limit, totalItems, totalPages: Math.ceil(totalItems / limit) };
}
