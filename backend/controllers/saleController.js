import * as saleModel from '../models/saleModel.js';
import AppError from '../utils/appError.js';
import { getPagination, pagination } from '../utils/pagination.js';
import {
  dateValue,
  moneyAmount,
  packagingSize,
  paymentMethods,
  positiveId,
  quantity,
} from '../utils/validation.js';

function saleItems(items) {
  if (!Array.isArray(items) || !items.length) throw new AppError(400, 'Add at least one sale item.');
  const combined = new Map();
  for (const item of items) {
    const fruitId = positiveId(item.fruitId, 'Fruit ID');
    const size = packagingSize(item.packagingSize);
    const count = quantity(item.quantity);
    const key = `${fruitId}:${size}`;
    const previous = combined.get(key);
    if (previous && previous.quantity > 2147483647 - count) {
      throw new AppError(400, 'Combined item quantity exceeds the supported stock limit.');
    }
    combined.set(key, {
      fruitId,
      packagingSize: size,
      quantity: previous ? previous.quantity + count : count,
    });
  }
  return [...combined.values()].sort((first, second) =>
    first.fruitId - second.fruitId || first.packagingSize.localeCompare(second.packagingSize));
}

export async function list(req, res) {
  const paging = getPagination(req.query);
  if (req.query.paymentStatus && !['PAID', 'PARTIALLY_PAID', 'UNPAID'].includes(req.query.paymentStatus)) {
    throw new AppError(400, 'Payment status must be PAID, PARTIALLY_PAID, or UNPAID.');
  }
  const { items, totalItems } = await saleModel.listSales({
    ...paging,
    vendorId: req.query.vendorId ? positiveId(req.query.vendorId, 'Vendor ID') : undefined,
    search: typeof req.query.search === 'string' ? req.query.search.trim() : '',
    paymentStatus: req.query.paymentStatus,
    dateFrom: dateValue(req.query.dateFrom, 'Start date'),
    dateTo: dateValue(req.query.dateTo, 'End date'),
  });
  res.json({ items, pagination: pagination(paging.page, paging.limit, totalItems) });
}

export async function get(req, res) {
  const sale = await saleModel.getSale(positiveId(req.params.id, 'Sale ID'));
  if (!sale) throw new AppError(404, 'Sale not found.');
  res.json({ sale });
}

export async function create(req, res) {
  const paymentMethod = req.body.paymentMethod || 'Cash';
  if (!paymentMethods.includes(paymentMethod)) {
    throw new AppError(400, 'Payment method must be Cash, Mobile money, or Outstanding.');
  }
  const sale = {
    vendorId: positiveId(req.body.vendorId, 'Vendor ID'),
    saleDate: dateValue(req.body.saleDate, 'Sale date'),
    paymentMethod,
    amountPaid: req.body.amountPaid === undefined
      ? 0
      : moneyAmount(req.body.amountPaid, 'Amount paid', true, 9999999999.99),
    items: saleItems(req.body.items),
  };
  const result = await saleModel.createSale(sale);
  res.status(201).json({ ...result, message: 'Sale recorded and stock updated.' });
}

export async function addPayment(req, res) {
  const saleId = positiveId(req.params.saleId, 'Sale ID');
  const amount = moneyAmount(req.body.amount, 'Payment amount', false, 9999999999.99);
  const paymentMethod = req.body.paymentMethod;
  if (paymentMethod !== undefined && !paymentMethods.includes(paymentMethod)) {
    throw new AppError(400, 'Payment method must be Cash, Mobile money, or Outstanding.');
  }
  const result = await saleModel.addSalePayment(saleId, amount, paymentMethod);
  res.json({ ...result, message: 'Sale payment recorded.' });
}
