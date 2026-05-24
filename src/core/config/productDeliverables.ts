export const PRODUCT_DELIVERABLE_BUCKET = 'product-deliverables';
export const PRODUCT_DELIVERABLE_MAX_BYTES = 50 * 1024 * 1024;

export const PRODUCT_DELIVERABLE_ALLOWED_EXTENSIONS = [
  'pdf',
  'zip',
  'rar',
  '7z',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'txt',
  'csv',
  'epub',
] as const;

export const PRODUCT_DELIVERABLE_ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/zip',
  'application/x-zip-compressed',
  'application/vnd.rar',
  'application/x-rar-compressed',
  'application/x-7z-compressed',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'application/epub+zip',
] as const;

export const PRODUCT_DELIVERABLE_INPUT_ACCEPT = PRODUCT_DELIVERABLE_ALLOWED_EXTENSIONS
  .map((extension) => `.${extension}`)
  .join(',');

type ProductDeliverableLikeFile = {
  name: string;
  size: number;
  type?: string | null;
};

export function getProductDeliverableExtension(fileName: string) {
  const normalized = String(fileName || '').trim().toLowerCase();
  const parts = normalized.split('.');
  return parts.length > 1 ? parts.pop() || '' : '';
}

export function sanitizeProductDeliverableFileName(fileName: string) {
  return String(fileName || '')
    .normalize('NFKD')
    .replace(/[^\w.\- ]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 120);
}

export function formatProductDeliverableSize(bytes: number | null | undefined) {
  const total = Number(bytes || 0);
  if (!Number.isFinite(total) || total <= 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB'];
  let value = total;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const decimals = unitIndex === 0 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(decimals)} ${units[unitIndex]}`;
}

export function isPdfProductDeliverable(file: { name?: string | null; type?: string | null }) {
  const extension = getProductDeliverableExtension(String(file.name || ''));
  const mimeType = String(file.type || '').trim().toLowerCase();
  return extension === 'pdf' || mimeType === 'application/pdf';
}

export function validateProductDeliverableFile(file: ProductDeliverableLikeFile) {
  const extension = getProductDeliverableExtension(file.name);
  const mimeType = String(file.type || '').trim().toLowerCase();

  if (!extension || !PRODUCT_DELIVERABLE_ALLOWED_EXTENSIONS.includes(extension as any)) {
    return {
      ok: false,
      error: 'Tipo de arquivo nao permitido. Envie PDF, ZIP, DOCX, XLSX, PPTX, TXT, CSV, EPUB, RAR ou 7Z.',
    } as const;
  }

  if (mimeType && !PRODUCT_DELIVERABLE_ALLOWED_MIME_TYPES.includes(mimeType as any)) {
    return {
      ok: false,
      error: 'O tipo MIME deste arquivo nao e suportado para entrega automatica.',
    } as const;
  }

  if (Number(file.size || 0) <= 0) {
    return {
      ok: false,
      error: 'O arquivo selecionado esta vazio.',
    } as const;
  }

  if (Number(file.size || 0) > PRODUCT_DELIVERABLE_MAX_BYTES) {
    return {
      ok: false,
      error: `O arquivo excede o limite de ${formatProductDeliverableSize(PRODUCT_DELIVERABLE_MAX_BYTES)}.`,
    } as const;
  }

  return {
    ok: true,
    error: null,
  } as const;
}
