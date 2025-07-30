import CryptoJS from 'crypto-js';

/**
 * Generate a random 32-byte secret for hash time locked contracts
 * @returns Hex string of 32 random bytes
 */
export function generateSecret(): string {
  const randomBytes = CryptoJS.lib.WordArray.random(32);
  return randomBytes.toString(CryptoJS.enc.Hex);
}

/**
 * Generate SHA-256 hash of a secret
 * @param secret Hex string of the secret
 * @returns SHA-256 hash as hex string
 */
export function hashSecret(secret: string): string {
  const secretBytes = CryptoJS.enc.Hex.parse(secret);
  const hash = CryptoJS.SHA256(secretBytes);
  return hash.toString(CryptoJS.enc.Hex);
}

/**
 * Verify that a secret matches a given hash
 * @param secret Hex string of the secret
 * @param hash Expected SHA-256 hash
 * @returns True if secret matches hash
 */
export function verifySecret(secret: string, hash: string): boolean {
  const computedHash = hashSecret(secret);
  return computedHash.toLowerCase() === hash.toLowerCase();
}

/**
 * Convert hex string to bytes32 format for Ethereum contracts
 * @param hex Hex string (with or without 0x prefix)
 * @returns 0x-prefixed 32-byte hex string
 */
export function toBytes32(hex: string): string {
  const cleanHex = hex.replace(/^0x/, '');
  if (cleanHex.length !== 64) {
    throw new Error('Invalid hex length for bytes32');
  }
  return '0x' + cleanHex;
}

/**
 * Convert secret to bytes format for Stellar contracts
 * @param secret Hex string secret
 * @returns Uint8Array of secret bytes
 */
export function secretToBytes(secret: string): Uint8Array {
  const cleanHex = secret.replace(/^0x/, '');
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substr(i, 2), 16);
  }
  return bytes;
}

/**
 * Convert bytes to hex string
 * @param bytes Uint8Array of bytes
 * @returns Hex string
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Generate order hash for tracking cross-chain orders
 * @param orderData Object containing order details
 * @returns SHA-256 hash of order data
 */
export function generateOrderHash(orderData: {
  maker: string;
  srcChain: string;
  dstChain: string;
  srcToken: string;
  dstToken: string;
  srcAmount: string;
  dstAmount: string;
  timelock: number;
  nonce: string;
}): string {
  const orderString = JSON.stringify(orderData, Object.keys(orderData).sort());
  return CryptoJS.SHA256(orderString).toString(CryptoJS.enc.Hex);
}

/**
 * Generate a random nonce for order uniqueness
 * @returns Random hex string
 */
export function generateNonce(): string {
  return CryptoJS.lib.WordArray.random(16).toString(CryptoJS.enc.Hex);
}

/**
 * Validate secret format (32 bytes hex)
 * @param secret Secret to validate
 * @returns True if valid format
 */
export function isValidSecret(secret: string): boolean {
  const cleanHex = secret.replace(/^0x/, '');
  return /^[0-9a-fA-F]{64}$/.test(cleanHex);
}

/**
 * Validate hash format (32 bytes hex)
 * @param hash Hash to validate
 * @returns True if valid format
 */
export function isValidHash(hash: string): boolean {
  const cleanHex = hash.replace(/^0x/, '');
  return /^[0-9a-fA-F]{64}$/.test(cleanHex);
} 