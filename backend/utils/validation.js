import AppError from './appError.js';

export const packagingSizes = ['small', 'medium', 'large'];
export const paymentMethods = ['Cash', 'Mobile money', 'Outstanding'];

export function positiveId(value, label = 'id') {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1 || id > 2147483647) {
    throw new AppError(400, `${label} must be a valid positive whole number.`);
  }
  return id;
}

export function requiredText(value, label, maxLength = 255) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
    throw new AppError(400, `${label} is required and must be ${maxLength} characters or fewer.`);
  }
  return value.trim();
}

export function positiveNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new AppError(400, `${label} must be greater than zero.`);
  return number;
}

export function nonNegativeNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new AppError(400, `${label} cannot be negative.`);
  return number;
}

export function moneyAmount(value, label, allowZero = false, maximum = 99999999.99) {
  const amount = Number(value);
  const decimal = typeof value === 'string' ? value.trim() : String(value);
  const validFormat = /^\d+(?:\.\d{1,2})?$/.test(decimal);
  if (!validFormat || !Number.isFinite(amount) || amount > maximum || (allowZero ? amount < 0 : amount <= 0)) {
    throw new AppError(400, `${label} must be ${allowZero ? 'zero or greater' : 'greater than zero'} and use no more than two decimal places.`);
  }
  return amount;
}

export function quantity(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0 || number > 2147483647) {
    throw new AppError(400, 'Quantity must be a valid positive whole number.');
  }
  return number;
}

export function packagingSize(value) {
  if (!packagingSizes.includes(value)) {
    throw new AppError(400, 'Packaging size must be small, medium, or large.');
  }
  return value;
}

export function dateValue(value, label) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new AppError(400, `${label} must be a valid date in YYYY-MM-DD format.`);
  }
  const parsedDate = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== value) {
    throw new AppError(400, `${label} must be a valid date in YYYY-MM-DD format.`);
  }
  return value;
}
