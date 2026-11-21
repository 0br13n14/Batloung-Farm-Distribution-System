import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { checkDatabase } from './database/db.js';
import errorHandler from './middleware/errorHandler.js';
import authRoutes from './routes/authRoutes.js';
import fruitStockRoutes from './routes/fruitStockRoutes.js';
import purchaseRoutes from './routes/purchaseRoutes.js';
import reportRoutes from './routes/reportRoutes.js';
import saleRoutes from './routes/saleRoutes.js';
import supplierRoutes from './routes/supplierRoutes.js';
import userRoutes from './routes/userRoutes.js';
import vendorRoutes from './routes/vendorRoutes.js';
import AppError from './utils/appError.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  if (req.body === undefined) req.body = {};
  if (req.body === null || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return next(new AppError(400, 'Request body must be a JSON object.'));
  }
  next();
});

app.get('/api/health', async (req, res) => {
  const database = await checkDatabase();
  res.status(database ? 200 : 503).json({
    status: database ? 'ok' : 'unavailable',
    database: database ? 'connected' : 'unavailable',
  });
});

app.use('/api/auth', authRoutes);
app.use('/api', fruitStockRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/users', userRoutes);
app.use('/api/vendors', vendorRoutes);
app.use('/api/purchases', purchaseRoutes);
app.use('/api/sales', saleRoutes);
app.use('/api/reports', reportRoutes);

app.use((req, res, next) => next(new AppError(404, 'The requested endpoint was not found.')));
app.use(errorHandler);

const port = Number(process.env.PORT) || 5000;

app.listen(port, async () => {
  if (!(await checkDatabase())) {
    console.warn('MySQL is unavailable; the API started but database requests will fail.');
  } else {
    console.info(`Batloung Farm API listening on port ${port}.`);
  }
});

export default app;
