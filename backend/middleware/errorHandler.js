export default function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Request body must contain valid JSON.' });
  }
  if (error.type === 'entity.too.large') {
    return res.status(413).json({ message: 'Request body is too large.' });
  }
  const status = Number.isInteger(error.statusCode) ? error.statusCode : 500;
  const message = status >= 500
    ? 'Something went wrong while processing your request.'
    : error.message;

  if (error.code === 'ER_DUP_ENTRY') {
    return res.status(400).json({ message: 'A record with those details already exists.' });
  }
  if (error.code === 'ER_NO_REFERENCED_ROW_2') {
    return res.status(400).json({ message: 'The selected related record does not exist.' });
  }
  if (error.code === 'ER_ROW_IS_REFERENCED_2') {
    return res.status(409).json({ message: 'This record cannot be deleted because it is still in use.' });
  }
  return res.status(status).json({ message: message || 'The request could not be completed.' });
}
