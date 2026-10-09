import crypto from 'crypto';

export function getEncryptionKey(configuredKey: string) {
  const hexKey = /^[0-9a-f]{64}$/i.test(configuredKey) ? Buffer.from(configuredKey, 'hex') : null;
  return hexKey ?? crypto.createHash('sha256').update(configuredKey).digest();
}
