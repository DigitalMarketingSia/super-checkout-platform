import crypto from 'crypto';

/**
 * UTILS: CRYPTO (AES-256-GCM)
 * 
 * Este utilitário lida com a criptografia de chaves sensíveis (Encrypted at Rest).
 * Utiliza uma Master Key (PAYMENT_ENCRYPTION_KEY) definida no ambiente.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // Standard for GCM
const AUTH_TAG_LENGTH = 16;
const ENCRYPTED_PREFIX = 'iv:';
const MIN_SECRET_LENGTH = 32;

function isEncryptedPayload(value: string): boolean {
  if (!value || typeof value !== 'string') return false;
  if (value.startsWith(ENCRYPTED_PREFIX)) {
    return value.substring(ENCRYPTED_PREFIX.length).split(':').length === 3;
  }
  return value.split(':').length === 3;
}

/**
 * Obtém a chave secreta de 32 bytes a partir da ENV.
 */
function normalizeSecretKey(value: string | undefined, label: string): Buffer {
  const key = String(value || '').trim();
  if (!key) {
    throw new Error(`${label} is required`);
  }
  if (key.length < MIN_SECRET_LENGTH || /^your_|placeholder|change_me/i.test(key)) {
    throw new Error(`${label} must be a non-placeholder secret with at least ${MIN_SECRET_LENGTH} characters`);
  }
  return crypto.createHash('sha256').update(key).digest();
}

function getSecretKey(): Buffer {
  return normalizeSecretKey(process.env.PAYMENT_ENCRYPTION_KEY, 'PAYMENT_ENCRYPTION_KEY');
}

function getPreviousSecretKeys(): Buffer[] {
  const previousKeys = [
    process.env.PAYMENT_ENCRYPTION_KEY_PREVIOUS
  ]
    .filter(Boolean)
    .flatMap((value) => String(value).split(','))
    .map((value) => value.trim())
    .filter(Boolean);

  return previousKeys.map((key) => normalizeSecretKey(key, 'PAYMENT_ENCRYPTION_KEY_PREVIOUS'));
}

function decryptWithKey(encryptedText: string, secretKey: Buffer): string {
  const sanitizedText = encryptedText.startsWith(ENCRYPTED_PREFIX) ? encryptedText.substring(ENCRYPTED_PREFIX.length) : encryptedText;
  const [ivHex, authTagHex, encryptedHex] = sanitizedText.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, secretKey, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Encripta uma string.
 * Retorno: iv:authTag:content (em hex)
 */
export function encrypt(text: string): string {
  if (!text) return '';
  
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const secretKey = getSecretKey();
    const cipher = crypto.createCipheriv(ALGORITHM, secretKey, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag().toString('hex');
    
    return `iv:${iv.toString('hex')}:${authTag}:${encrypted}`;
  } catch (error: any) {
    console.error('[CryptoUtils] Encryption failed:', error.message);
    throw new Error('Failed to encrypt sensitive data');
  }
}

/**
 * Decripta uma string.
 * Se não for um formato válido de criptografia, retorna o texto puro (fallback migração).
 */
export function decrypt(encryptedText: string): string {
  if (!encryptedText) return '';
  
  // Remove prefix if it exists to normalize format
  const sanitizedText = encryptedText.startsWith(ENCRYPTED_PREFIX) ? encryptedText.substring(ENCRYPTED_PREFIX.length) : encryptedText;
  
  const parts = sanitizedText.split(':');
  
  // Se não tem as 3 partes após remover o prefixo, assumimos que é texto puro
  if (parts.length !== 3) {
    return encryptedText;
  }
  
  try {
    let decrypted = '';
    const candidateKeys = [getSecretKey(), ...getPreviousSecretKeys()];
    let lastError: any = null;

    for (const secretKey of candidateKeys) {
      try {
        decrypted = decryptWithKey(encryptedText, secretKey);
        lastError = null;
        break;
      } catch (error: any) {
        lastError = error;
      }
    }

    if (lastError) {
      throw lastError;
    }

    // Recover credentials that were accidentally encrypted twice by older saves.
    if (isEncryptedPayload(decrypted) && decrypted !== encryptedText) {
      return decrypt(decrypted);
    }
    
    return decrypted;
  } catch (error: any) {
    if (error.message.includes('bad decrypt') || error.message.includes('auth tag mismatch')) {
      console.error('❌ [CryptoUtils] Decryption failed: PAYMENT_ENCRYPTION_KEY mismatch or corrupted data.');
    } else {
      console.warn('[CryptoUtils] Decryption error:', error.message);
    }
    throw new Error('DECRYPTION_FAILED');
  }
}

/**
 * Gera uma assinatura HMAC-SHA256 para um ID de pedido.
 * Usado para autenticar consultas de status (check-status) sem exigir login.
 */
export type OrderSignaturePurpose = 'order_session' | 'deliverable_file';

const ORDER_SIGNATURE_VERSION = 'v2';
const ORDER_SIGNATURE_DEFAULT_TTL_MS = 72 * 60 * 60 * 1000;

function getOrderSigningKeys() {
  const current = normalizeSecretKey(process.env.ORDER_LINK_SIGNING_KEY, 'ORDER_LINK_SIGNING_KEY');
  const previous = String(process.env.ORDER_LINK_SIGNING_KEY_PREVIOUS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => normalizeSecretKey(value, 'ORDER_LINK_SIGNING_KEY_PREVIOUS'));
  return [current, ...previous];
}

function orderSignaturePayload(orderId: string, purpose: OrderSignaturePurpose, expiresAt: number) {
  return `${ORDER_SIGNATURE_VERSION}\n${orderId}\n${purpose}\n${expiresAt}`;
}

export function generateSignature(
  orderId: string,
  purpose: OrderSignaturePurpose = 'order_session',
  ttlMs = ORDER_SIGNATURE_DEFAULT_TTL_MS,
): string {
  if (!orderId || !Number.isFinite(ttlMs) || ttlMs <= 0) return '';
  const expiresAt = Date.now() + ttlMs;
  const mac = crypto
    .createHmac('sha256', getOrderSigningKeys()[0])
    .update(orderSignaturePayload(orderId, purpose, expiresAt))
    .digest('hex');
  return `${ORDER_SIGNATURE_VERSION}.${expiresAt.toString(36)}.${purpose}.${mac}`;
}

/**
 * Verifica se uma assinatura é válida para um determinado ID de pedido.
 */
export function verifySignature(
  orderId: string,
  signature: string,
  purpose: OrderSignaturePurpose = 'order_session',
): boolean {
  if (!orderId || !signature) return false;
  try {
    const match = signature.match(/^v2\.([0-9a-z]+)\.(order_session|deliverable_file)\.([0-9a-f]{64})$/i);
    if (!match || match[2] !== purpose) return false;

    const expiresAt = Number.parseInt(match[1], 36);
    if (!Number.isSafeInteger(expiresAt) || expiresAt <= Date.now()) return false;

    const received = Buffer.from(match[3], 'hex');
    return getOrderSigningKeys().some((secretKey) => {
      const expected = crypto
        .createHmac('sha256', secretKey)
        .update(orderSignaturePayload(orderId, purpose, expiresAt))
        .digest();
      return received.length === expected.length && crypto.timingSafeEqual(received, expected);
    });
  } catch {
    return false;
  }
}
