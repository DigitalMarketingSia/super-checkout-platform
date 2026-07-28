import { createHash, createHmac, randomUUID } from 'node:crypto';

export type CentralInstallationTrustScope =
  | 'installation:self_service'
  | 'installation:read'
  | 'upgrade:intents'
  | 'system:update';

export type CentralInstallationTrustConfig = {
  installationId: string;
  credentialId: string;
  credentialSecret: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function configuredValue(name: string) {
  return String(process.env[name] || '').trim();
}

function assertUuid(value: string, name: string) {
  if (!UUID_PATTERN.test(value)) {
    throw new Error(`${name} must be a UUID.`);
  }
}

/**
 * Returns null only when the installation-trust feature was not configured at
 * all. A partially configured credential is rejected instead of falling back
 * to the global secret, preventing accidental downgrade after migration.
 */
export function getCentralInstallationTrustConfig(): CentralInstallationTrustConfig | null {
  const installationId = configuredValue('CENTRAL_INSTALLATION_ID');
  const credentialId = configuredValue('CENTRAL_INSTALLATION_CREDENTIAL_ID');
  const credentialSecret = configuredValue('CENTRAL_INSTALLATION_CREDENTIAL_SECRET');
  const values = [installationId, credentialId, credentialSecret];

  if (values.every((value) => !value)) return null;
  if (values.some((value) => !value)) {
    throw new Error('Central installation trust credentials are incomplete.');
  }

  assertUuid(installationId, 'CENTRAL_INSTALLATION_ID');
  assertUuid(credentialId, 'CENTRAL_INSTALLATION_CREDENTIAL_ID');
  if (credentialSecret.length < 32) {
    throw new Error('CENTRAL_INSTALLATION_CREDENTIAL_SECRET is invalid.');
  }

  return { installationId, credentialId, credentialSecret };
}

export function buildCentralInstallationTrustHeaders(input: {
  config: CentralInstallationTrustConfig;
  method: string;
  endpoint: string;
  rawBody: string;
  timestamp?: string;
  requestId?: string;
}) {
  const timestamp = input.timestamp || String(Math.floor(Date.now() / 1000));
  const requestId = input.requestId || randomUUID();
  assertUuid(requestId, 'request id');
  if (!/^[a-z0-9][a-z0-9._/-]*$/i.test(input.endpoint)) {
    throw new Error('Central endpoint is invalid for HMAC signing.');
  }

  const bodyHash = createHash('sha256').update(input.rawBody, 'utf8').digest('hex');
  const canonicalValue = [
    'v1',
    timestamp,
    requestId,
    input.method.toUpperCase(),
    input.endpoint,
    bodyHash,
  ].join('.');
  const signature = createHmac('sha256', input.config.credentialSecret)
    .update(canonicalValue, 'utf8')
    .digest('hex');

  return {
    'x-super-checkout-installation-id': input.config.installationId,
    'x-super-checkout-credential-id': input.config.credentialId,
    'x-super-checkout-timestamp': timestamp,
    'x-super-checkout-request-id': requestId,
    'x-super-checkout-signature': `sha256=${signature}`,
  };
}
