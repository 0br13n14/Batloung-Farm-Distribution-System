import {
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);

function authSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret === 'change_me_in_env') throw new Error('AUTH_SECRET must be set to a private value.');
  return secret;
}

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt}$${key.toString('hex')}`;
}

export async function verifyPassword(password, passwordHash) {
  if (typeof passwordHash !== 'string') return false;
  const [algorithm, salt, storedKey] = passwordHash.split('$');
  if (algorithm !== 'scrypt' || !salt || !/^[a-f0-9]{128}$/i.test(storedKey || '')) return false;
  const derivedKey = await scrypt(password, salt, 64);
  return timingSafeEqual(derivedKey, Buffer.from(storedKey, 'hex'));
}

export function signToken(user) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = {
    userId: user.userId,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
    exp: issuedAt + 8 * 60 * 60,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', authSecret()).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

export function verifyToken(token) {
  try {
    const [encoded, suppliedSignature, extra] = token.split('.');
    if (!encoded || !suppliedSignature || extra) return null;
    const expectedSignature = createHmac('sha256', authSecret()).update(encoded).digest();
    const actualSignature = Buffer.from(suppliedSignature, 'base64url');
    if (actualSignature.length !== expectedSignature.length || !timingSafeEqual(actualSignature, expectedSignature)) {
      return null;
    }
    const user = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!user.userId || !user.username || !user.fullName || !['admin', 'sales'].includes(user.role)) return null;
    return user.exp > Math.floor(Date.now() / 1000) ? user : null;
  } catch {
    return null;
  }
}
