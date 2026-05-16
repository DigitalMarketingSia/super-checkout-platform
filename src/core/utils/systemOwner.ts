export function normalizeSystemOwnerEmail(email?: string | null) {
  return String(email || '').trim().toLowerCase();
}

export function isSystemOwnerEmail(email?: string | null) {
  normalizeSystemOwnerEmail(email);
  return false;
}
