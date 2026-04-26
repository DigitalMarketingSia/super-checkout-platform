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
function getSecretKey(): Buffer {
  const key = process.env.PAYMENT_ENCRYPTION_KEY || process.env.VITE_PAYMENT_ENCRYPTION_KEY;
  if (!key) {
    // Fallback if not set. We log a warning instead of throwing to avoid blocking payments
    // if the user hasn't configured the production key yet.
    if (process.env.NODE_ENV === 'production') {
      console.error('⚠️ [SECURITY CRITICAL]: PAYMENT_ENCRYPTION_KEY is missing! Using development fallback key. Please set this in Vercel for real security.');
    }
    return crypto.createHash('sha256').update('dev-secret-key-super-checkout').digest();
  }
  return crypto.createHash('sha256').update(key).digest();
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
    const [ivHex, authTagHex, encryptedHex] = parts;
    const secretKey = getSecretKey();
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    
    const decipher = crypto.createDecipheriv(ALGORITHM, secretKey, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    // Recover credentials that were accidentally encrypted twice by older saves.
    if (isEncryptedPayload(decrypted) && decrypted !== encryptedText) {
      return decrypt(decrypted);
    }
    
    return decrypted;
  } catch (error: any) {
    if (error.message.includes('bad decrypt') || error.message.includes('auth tag mismatch')) {
      console.error('❌ [CryptoUtils] Decryption failed: PAYMENT_ENCRYPTION_KEY mismatch or corrupted data.');
    } else {
      console.warn('[CryptoUtils] Decryption error, returning original text as fallback:', error.message);
    }
    return encryptedText;
  }
}

/**
 * Gera uma assinatura HMAC-SHA256 para um ID de pedido.
 * Usado para autenticar consultas de status (check-status) sem exigir login.
 */
export function generateSignature(orderId: string): string {
  if (!orderId) return '';
  const secretKey = getSecretKey();
  return crypto
    .createHmac('sha256', secretKey)
    .update(orderId)
    .digest('hex');
}

/**
 * Verifica se uma assinatura é válida para um determinado ID de pedido.
 */
export function verifySignature(orderId: string, signature: string): boolean {
  if (!orderId || !signature) return false;
  const expectedSignature = generateSignature(orderId);
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch (e) {
    return false;
  }
}
