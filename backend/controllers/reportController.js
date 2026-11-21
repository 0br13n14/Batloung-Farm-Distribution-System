import * as reportModel from '../models/reportModel.js';
import AppError from '../utils/appError.js';
import { dateValue } from '../utils/validation.js';

export async function topFruits(req, res) {
  res.json({ items: await reportModel.topFruits() });
}

export async function revenue(req, res) {
  const startDate = dateValue(req.query.startDate, 'Start date');
  const endDate = dateValue(req.query.endDate, 'End date');
  if (!startDate || !endDate) throw new AppError(400, 'Start date and end date are required.');
  if (startDate > endDate) throw new AppError(400, 'Start date must be on or before end date.');
  res.json(await reportModel.revenue(startDate, endDate));
}

export async function topVendor(req, res) {
  res.json({ vendor: await reportModel.topVendor() });
}

export async function stockLevels(req, res) {
  res.json({ items: await reportModel.stockLevels() });
}
