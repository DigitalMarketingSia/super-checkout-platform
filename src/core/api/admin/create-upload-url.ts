import crypto from 'crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { enforceApiRateLimit } from '../_rate-limit.js';
import {
  getLocalSupabasePublicConfig,
  getLocalSupabaseServerKeyErrorMessage,
  isLocalSupabaseServerKeyFailure,
  resolveLocalSupabaseServerClient,
  validateLocalUserWithPublicKey,
} from '../_supabase-server.js';

type UploadResourceType = 'product' | 'member_area' | 'checkout';

type UploadResourceConfig = {
  bucket: 'products' | 'member-areas' | 'checkouts';
  table: 'products' | 'member_areas' | 'checkouts';
  ownerColumn: 'user_id' | 'owner_id';
  allowedAssets: readonly string[];
};

const RESOURCE_CONFIG: Record<UploadResourceType, UploadResourceConfig> = {
  product: {
    bucket: 'products',
    table: 'products',
    ownerColumn: 'user_id',
    allowedAssets: ['image'],
  },
  member_area: {
    bucket: 'member-areas',
    table: 'member_areas',
    ownerColumn: 'owner_id',
    allowedAssets: ['logo', 'favicon', 'banner', 'login'],
  },
  checkout: {
    bucket: 'checkouts',
    table: 'checkouts',
    ownerColumn: 'user_id',
    allowedAssets: ['banner'],
  },
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_PUBLIC_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024;
const IMAGE_EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

function parseBody(req: VercelRequest) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');

  const body = parseBody(req);
  const resourceType = String(body.resource_type || '') as UploadResourceType;
  const resourceId = String(body.resource_id || '').trim();
  const assetKind = String(body.asset_kind || '').trim().toLowerCase();
  const contentType = String(body.content_type || '').trim().toLowerCase();
  const fileSize = Number(body.file_size || 0);
  const config = RESOURCE_CONFIG[resourceType];

  const rateLimit = enforceApiRateLimit(req, res, {
    scope: 'admin_create_upload_url',
    identifiers: [resourceType, resourceId],
    limit: 60,
    windowMs: 15 * 60 * 1000,
  });
  if (!rateLimit.allowed) return res.status(429).json({ error: 'Too many requests' });

  if (!config || !UUID_PATTERN.test(resourceId) || !config.allowedAssets.includes(assetKind)) {
    return res.status(400).json({ error: 'Invalid upload target' });
  }

  if (!IMAGE_EXTENSION_BY_MIME_TYPE[contentType]) {
    return res.status(400).json({ error: 'Only JPEG, PNG, WebP, GIF or AVIF images are allowed' });
  }
  if (!Number.isSafeInteger(fileSize) || fileSize <= 0 || fileSize > MAX_PUBLIC_IMAGE_UPLOAD_BYTES) {
    return res.status(400).json({ error: 'Image size must be between 1 byte and 10 MB' });
  }

  const authHeader = String(req.headers.authorization || '');
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : '';
  if (!jwt) return res.status(401).json({ error: 'Missing authorization' });

  const { supabaseUrl, publicKey } = getLocalSupabasePublicConfig();
  if (!supabaseUrl || !publicKey) return res.status(500).json({ error: 'Server configuration error' });

  const user = await validateLocalUserWithPublicKey(jwt);
  if (!user?.id) return res.status(401).json({ error: 'Invalid session' });

  const { supabase, probeError } = await resolveLocalSupabaseServerClient();
  if (!supabase) return res.status(500).json({ error: getLocalSupabaseServerKeyErrorMessage() });

  const { data: resource, error: resourceError } = await supabase
    .from(config.table)
    .select(config.ownerColumn)
    .eq('id', resourceId)
    .maybeSingle();

  if (isLocalSupabaseServerKeyFailure(resourceError || probeError)) {
    return res.status(500).json({ error: getLocalSupabaseServerKeyErrorMessage() });
  }
  if (resourceError) {
    console.error('[create-upload-url] resource lookup failed:', resourceError.message || resourceError);
    return res.status(500).json({ error: 'Unable to verify upload target' });
  }
  if (!resource) return res.status(404).json({ error: 'Upload target not found' });
  if (String(resource[config.ownerColumn] || '') !== user.id) {
    return res.status(403).json({ error: 'Upload target is not owned by the current user' });
  }

  const extension = IMAGE_EXTENSION_BY_MIME_TYPE[contentType];
  const nonce = crypto.randomBytes(8).toString('hex');
  const path = `${resourceId}/${assetKind}_${Date.now()}_${nonce}.${extension}`;
  const { data: upload, error: uploadError } = await supabase.storage
    .from(config.bucket)
    .createSignedUploadUrl(path);

  if (isLocalSupabaseServerKeyFailure(uploadError)) {
    return res.status(500).json({ error: getLocalSupabaseServerKeyErrorMessage() });
  }
  if (uploadError || !upload?.token) {
    console.error('[create-upload-url] signed upload creation failed:', uploadError?.message || uploadError);
    return res.status(500).json({ error: 'Unable to prepare image upload' });
  }

  const { data: publicUrl } = supabase.storage.from(config.bucket).getPublicUrl(path);
  return res.status(200).json({
    bucket: config.bucket,
    path,
    token: upload.token,
    public_url: publicUrl.publicUrl,
  });
}
