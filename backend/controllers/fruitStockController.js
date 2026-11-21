import * as fruitStockModel from '../models/fruitStockModel.js';
import AppError from '../utils/appError.js';
import { getPagination, pagination } from '../utils/pagination.js';
import {
  moneyAmount,
  nonNegativeNumber,
  packagingSize,
  positiveId,
  requiredText,
} from '../utils/validation.js';

export async function listFruits(req, res) {
  const paging = getPagination(req.query);
  if (req.query.status && !['active', 'inactive'].includes(req.query.status)) {
    throw new AppError(400, 'Fruit status must be active or inactive.');
  }
  const { items, totalItems } = await fruitStockModel.listFruits({
    ...paging,
    search: typeof req.query.search === 'string' ? req.query.search.trim() : '',
    status: req.query.status,
  });
  res.json({ items, pagination: pagination(paging.page, paging.limit, totalItems) });
}

export async function createFruit(req, res) {
  const fruit = validateFruit(req.body);
  const fruitId = await fruitStockModel.createFruit(fruit);
  res.status(201).json({ fruitId, message: 'Fruit created.' });
}

export async function updateFruit(req, res) {
  const fruitId = positiveId(req.params.id, 'Fruit ID');
  const fruit = validateFruit(req.body, true);
  if (!Object.keys(fruit).length) throw new AppError(400, 'Provide at least one fruit field to update.');
  if (!(await fruitStockModel.updateFruit(fruitId, fruit))) throw new AppError(404, 'Fruit not found.');
  res.json({ message: 'Fruit updated.' });
}

export async function deleteFruit(req, res) {
  const result = await fruitStockModel.deleteFruit(positiveId(req.params.id, 'Fruit ID'));
  if (result === 'referenced') throw new AppError(409, 'This fruit cannot be deleted because it has purchase or sales history.');
  if (result === 'missing') throw new AppError(404, 'Fruit not found.');
  res.json({ message: 'Fruit deleted.' });
}

function validateFruit(body, partial = false) {
  const fruit = {};
  if (!partial || body.fruitName !== undefined) fruit.fruitName = requiredText(body.fruitName, 'Fruit name', 80);
  if (!partial || body.description !== undefined) fruit.description = requiredText(body.description, 'Description');
  if (!partial || body.status !== undefined) {
    fruit.status = body.status || 'active';
    if (!['active', 'inactive'].includes(fruit.status)) throw new AppError(400, 'Fruit status must be active or inactive.');
  }
  if (!partial || body.lowStockThreshold !== undefined) {
    fruit.lowStockThreshold = body.lowStockThreshold === undefined ? 10 : Number(body.lowStockThreshold);
    if (!Number.isSafeInteger(fruit.lowStockThreshold) || fruit.lowStockThreshold < 0 || fruit.lowStockThreshold > 2147483647) {
      throw new AppError(400, 'Low-stock threshold must be a non-negative whole number.');
    }
  }
  return fruit;
}

export async function listStock(req, res) {
  const paging = getPagination(req.query);
  const size = req.query.packagingSize ? packagingSize(req.query.packagingSize) : undefined;
  const minPrice = req.query.minPrice === undefined ? undefined : nonNegativeNumber(req.query.minPrice, 'Minimum price');
  const maxPrice = req.query.maxPrice === undefined ? undefined : nonNegativeNumber(req.query.maxPrice, 'Maximum price');
  if (req.query.stockStatus && !['low', 'out', 'available'].includes(req.query.stockStatus)) {
    throw new AppError(400, 'Stock status must be low, out, or available.');
  }
  const { items, totalItems } = await fruitStockModel.listStock({
    ...paging,
    search: typeof req.query.search === 'string' ? req.query.search.trim() : '',
    packagingSize: size,
    stockStatus: req.query.stockStatus,
    minPrice,
    maxPrice,
    groupByFruit: req.query.groupByFruit === 'true',
  });
  res.json({ items, pagination: pagination(paging.page, paging.limit, totalItems) });
}

export async function updateStock(req, res) {
  const stockId = positiveId(req.params.stockId, 'Stock ID');
  const changes = {};
  if (req.body.availableQuantity !== undefined) {
    const value = Number(req.body.availableQuantity);
    if (!Number.isSafeInteger(value) || value < 0 || value > 2147483647) {
      throw new AppError(400, 'Available quantity must be a valid non-negative whole number.');
    }
    changes.availableQuantity = value;
  }
  if (req.body.unitSellingPrice !== undefined) {
    changes.unitSellingPrice = moneyAmount(req.body.unitSellingPrice, 'Unit selling price');
  }
  if (!Object.keys(changes).length) throw new AppError(400, 'Provide a quantity or selling price to update.');
  if (!(await fruitStockModel.updateStock(stockId, changes))) throw new AppError(404, 'Stock record not found.');
  res.json({ message: 'Stock updated.' });
}

export async function deleteStock(req, res) {
  const result = await fruitStockModel.deleteStock(positiveId(req.params.stockId, 'Stock ID'));
  if (result === 'referenced') throw new AppError(409, 'This packaging stock has purchase or sales history and cannot be deleted.');
  if (result === 'missing') throw new AppError(404, 'Stock record not found.');
  res.json({ message: 'Stock record deleted.' });
}
