import crypto from 'crypto';

/**
 * Generate a random 32-byte secret
 */
export function generateSecret() {
  return crypto.randomBytes(32);
}

/**
 * Generate SHA-256 hash of a secret (for hashlock)
 */
export function hashSecret(secret) {
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Verify that a secret matches a given hash
 */
export function verifySecret(secret, hash) {
  const computedHash = hashSecret(secret);
  return computedHash.equals(hash);
}

/**
 * Convert buffer to hex string with 0x prefix
 */
export function toHex(buffer) {
  return '0x' + buffer.toString('hex');
}

/**
 * Convert hex string to buffer
 */
export function fromHex(hexString) {
  const cleanHex = hexString.startsWith('0x') ? hexString.slice(2) : hexString;
  return Buffer.from(cleanHex, 'hex');
}

/**
 * Generate a unique order ID
 */
export function generateOrderId() {
  return crypto.randomBytes(16).toString('hex');
} 