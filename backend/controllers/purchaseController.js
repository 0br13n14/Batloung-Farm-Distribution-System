import * as purchaseModel from '../models/purchaseModel.js';
import AppError from '../utils/appError.js';
import { getPagination, pagination } from '../utils/pagination.js';
import {
  dateValue,
  moneyAmount,
  packagingSize,
  positiveId,
  quantity,
} from '../utils/validation.js';

function purchaseItems(items) {
  if (!Array.isArray(items) || !items.length) throw new AppError(400, 'Add at least one purchase item.');
  return items.map((item) => ({
    fruitId: positiveId(item.fruitId, 'Fruit ID'),
    packagingSize: packagingSize(item.packagingSize),
    quantity: quantity(item.quantity),
    unitCost: moneyAmount(item.unitCost, 'Unit cost'),
    unitSellingPrice: item.unitSellingPrice === undefined
      ? undefined
      : moneyAmount(item.unitSellingPrice, 'Unit selling price'),
  }));
}

export async function list(req, res) {
  const paging = getPagination(req.query);
  const { items, totalItems } = await purchaseModel.listPurchases({
    ...paging,
    supplierId: req.query.supplierId ? positiveId(req.query.supplierId, 'Supplier ID') : undefined,
    search: typeof req.query.search === 'string' ? req.query.search.trim() : '',
    dateFrom: dateValue(req.query.dateFrom, 'Start date'),
    dateTo: dateValue(req.query.dateTo, 'End date'),
  });
  res.json({ items, pagination: pagination(paging.page, paging.limit, totalItems) });
}

export async function get(req, res) {
  const purchase = await purchaseModel.getPurchase(positiveId(req.params.id, 'Purchase ID'));
  if (!purchase) throw new AppError(404, 'Purchase not found.');
  res.json({ purchase });
}

export async function create(req, res) {
  const purchase = {
    supplierId: positiveId(req.body.supplierId, 'Supplier ID'),
    purchaseDate: dateValue(req.body.purchaseDate, 'Purchase date'),
    items: purchaseItems(req.body.items),
  };
  const result = await purchaseModel.createPurchase(purchase);
  res.status(201).json({ ...result, message: 'Purchase recorded and stock updated.' });
}
