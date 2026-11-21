import * as supplierModel from '../models/supplierModel.js';
import AppError from '../utils/appError.js';
import { getPagination, pagination } from '../utils/pagination.js';
import { positiveId, requiredText } from '../utils/validation.js';

const provinces = ['Gauteng', 'Free State', 'KwaZulu-Natal', 'Western Cape', 'Eastern Cape', 'Limpopo', 'Mpumalanga', 'North West'];
const fields = ['businessName', 'contactPerson', 'phone', 'province', 'address'];

function validateSupplier(body, partial = false) {
  const supplier = {};
  for (const field of fields) {
    if (!partial || body[field] !== undefined) {
      supplier[field] = requiredText(body[field], field, field === 'address' ? 255 : 140);
    }
  }
  if (supplier.province && !provinces.includes(supplier.province)) {
    throw new AppError(400, 'Choose a valid South African province.');
  }
  return supplier;
}

export async function list(req, res) {
  const paging = getPagination(req.query);
  const { items, totalItems } = await supplierModel.listSuppliers({
    ...paging,
    search: typeof req.query.search === 'string' ? req.query.search.trim() : '',
  });
  res.json({ items, pagination: pagination(paging.page, paging.limit, totalItems) });
}

export async function create(req, res) {
  const supplierId = await supplierModel.createSupplier(validateSupplier(req.body));
  res.status(201).json({ supplierId, message: 'Supplier created.' });
}

export async function update(req, res) {
  const supplierId = positiveId(req.params.id, 'Supplier ID');
  const supplier = validateSupplier(req.body, true);
  if (!Object.keys(supplier).length) throw new AppError(400, 'Provide at least one supplier field to update.');
  if (!(await supplierModel.updateSupplier(supplierId, supplier))) throw new AppError(404, 'Supplier not found.');
  res.json({ message: 'Supplier updated.' });
}

export async function remove(req, res) {
  const result = await supplierModel.deleteSupplier(positiveId(req.params.id, 'Supplier ID'));
  if (result === 'referenced') throw new AppError(409, 'This supplier cannot be deleted because it has recorded purchases.');
  if (result === 'missing') throw new AppError(404, 'Supplier not found.');
  res.json({ message: 'Supplier deleted.' });
}
