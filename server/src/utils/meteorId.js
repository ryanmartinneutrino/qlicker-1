import crypto from 'crypto';

const CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export function generateMeteorId(length = 17) {
  const bytes = crypto.randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += CHARS.charAt(bytes[i] % CHARS.length);
  }
  return result;
}
