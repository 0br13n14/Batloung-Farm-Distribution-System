import * as vendorModel from '../models/vendorModel.js';
import AppError from '../utils/appError.js';
import { hqDistanceKm } from '../utils/distance.js';
import { getPagination, pagination } from '../utils/pagination.js';
import { positiveId, requiredText } from '../utils/validation.js';

function coordinates(body, partial = false) {
  const vendor = {};
  for (const field of ['latitude', 'longitude']) {
    if (!partial || body[field] !== undefined) {
      if (body[field] === null || body[field] === undefined || body[field] === '') {
        vendor[field] = null;
      } else {
        const value = Number(body[field]);
        const bound = field === 'latitude' ? 90 : 180;
        if (!Number.isFinite(value) || Math.abs(value) > bound) {
          throw new AppError(400, `${field} must be a valid coordinate.`);
        }
        vendor[field] = value;
      }
    }
  }
  return vendor;
}

function withDistance(vendor) {
  return { ...vendor, hqDistanceKm: hqDistanceKm(vendor.latitude, vendor.longitude) };
}

export async function list(req, res) {
  const paging = getPagination(req.query);
  const { items, totalItems } = await vendorModel.listVendors({
    ...paging,
    search: typeof req.query.search === 'string' ? req.query.search.trim() : '',
    location: typeof req.query.location === 'string' ? req.query.location.trim() : '',
  });
  res.json({
    items: items.map(withDistance),
    pagination: pagination(paging.page, paging.limit, totalItems),
  });
}

export async function create(req, res) {
  const vendor = {
    vendorName: requiredText(req.body.vendorName, 'Vendor name', 140),
    phoneNumber: requiredText(req.body.phoneNumber, 'Phone number', 30),
    location: requiredText(req.body.location, 'Location', 160),
    ...coordinates(req.body),
  };
  const vendorId = await vendorModel.createVendor(vendor);
  res.status(201).json({ vendorId, hqDistanceKm: hqDistanceKm(vendor.latitude, vendor.longitude), message: 'Vendor created.' });
}

export async function update(req, res) {
  const vendorId = positiveId(req.params.id, 'Vendor ID');
  const vendor = {};
  if (req.body.vendorName !== undefined) vendor.vendorName = requiredText(req.body.vendorName, 'Vendor name', 140);
  if (req.body.phoneNumber !== undefined) vendor.phoneNumber = requiredText(req.body.phoneNumber, 'Phone number', 30);
  if (req.body.location !== undefined) vendor.location = requiredText(req.body.location, 'Location', 160);
  Object.assign(vendor, coordinates(req.body, true));
  if (!Object.keys(vendor).length) throw new AppError(400, 'Provide at least one vendor field to update.');
  if (!(await vendorModel.updateVendor(vendorId, vendor))) throw new AppError(404, 'Vendor not found.');
  res.json({ message: 'Vendor updated.' });
}
