// Migrations only become executable from /admin/updates after:
// 1. the SQL file exists in src/migrations as vX.Y.Z.sql
// 2. the exact SHA-256 is registered here
// 3. CURRENT_SCHEMA_VERSION/SCHEMA_VERSION include the release
// Helper: npm run migration:hash -- src/migrations/vX.Y.Z.sql
export type ApprovedMigrationExecutionMode = 'runtime' | 'owner_manual';

export interface ApprovedMigrationRecord {
  file: string;
  sha256: string;
  execution?: ApprovedMigrationExecutionMode;
  reason?: string;
}

export const CURRENT_SCHEMA_VERSION = '1.0.45';
export const UNKNOWN_SCHEMA_VERSION = '0.0.0';

export const APPROVED_MIGRATION_ALLOWLIST: Record<string, ApprovedMigrationRecord> = {
  '1.0.1': {
    file: 'v1.0.1.sql',
    sha256: 'a0e7c52cac13245c6d8f68387dfffa67e180efb523696dc8989f140cf2e77896'
  },
  '1.0.2': {
    file: 'v1.0.2.sql',
    sha256: 'd21ce0cf568115c9bd4dbfc53d97c4f9a47495b22d8da11b0699b415725e146b'
  },
  '1.0.3': {
    file: 'v1.0.3.sql',
    sha256: '3a63df2ffab5f47cc1707d68a69137f3852bd27a1ee54dfbbc1aadea69290596'
  },
  '1.0.4': {
    file: 'v1.0.4.sql',
    sha256: 'f5b8cac26c7e73d43bfb6f6ce3dfb7e8ec6ebfebfad8244d6d934772d9a1e33f'
  },
  '1.0.5': {
    file: 'v1.0.5.sql',
    sha256: 'de6ce4676f6a50dc8bccf92bc9009e84021191191b5697b2c3c2cf46b35d497a'
  },
  '1.0.6': {
    file: 'v1.0.6.sql',
    sha256: '1cc3521f8d7a06fda782378b7aaf17648ffa8ac474149cb7ce34fafd73e58959'
  },
  '1.0.7': {
    file: 'v1.0.7.sql',
    sha256: 'b5fc42a1128c2d6338e650e8da4ce89b610f35d7443fcddf7a510c17e31ff9a6'
  },
  '1.0.8': {
    file: 'v1.0.8.sql',
    sha256: '10878ea5dd26e9f170dabc2dc07129fa36a990a23623d7b4e3a02b2207289eb8'
  },
  '1.0.9': {
    file: 'v1.0.9.sql',
    sha256: '3b740e3971fd0577febbb9ec7ab4e2bca8b6747d7ddb916cea9b9b9957e4f42a'
  },
  '1.0.10': {
    file: 'v1.0.10.sql',
    sha256: '0a8c9a78ffef6b83ab663885326e9011d8d515e4ed1c54be56e687e6dafbf385'
  },
  '1.0.11': {
    file: 'v1.0.11.sql',
    sha256: '7a44a7da98af1c4c623585e9e578a250dd396055108fc12f574585256dd31241'
  },
  '1.0.12': {
    file: 'v1.0.12.sql',
    sha256: '4ca3d8dd9ee1c0332e6491a31520ec09bdedafeffa442c55f093bfd500c13fc8'
  },
  '1.0.13': {
    file: 'v1.0.13.sql',
    sha256: 'c2463d1e9161c2dd0f8047bd0d0d505753b7868d41a2e16ec27f74088471584d'
  },
  '1.0.14': {
    file: 'v1.0.14.sql',
    sha256: '4922a0f7cef9bfade4e9171e56ca5330eeeb360cba18f11f4f0bb0516b49ed85'
  },
  '1.0.15': {
    file: 'v1.0.15.sql',
    sha256: 'cafcad2aacc7db0430503c5c01d1757e6cba84e3040d46310ff5e4f0889f6d11'
  },
  '1.0.16': {
    file: 'v1.0.16.sql',
    sha256: '3e3e7e050e97dd51ffa8b52cba94ae30425fca8baf515c6af85c300aefebde3b'
  },
  '1.0.17': {
    file: 'v1.0.17.sql',
    sha256: '3d361d774027495d8abd3b2be3cfe62935f01793cf87bdef3331554f463b76bd'
  },
  '1.0.18': {
    file: 'v1.0.18.sql',
    sha256: 'deab60c1a27b95f8beb4036f6d0e01f9599503e1b2a7ccd3a0fb8577921b5e23'
  },
  '1.0.19': {
    file: 'v1.0.19.sql',
    sha256: '49c217fc791d80517bca36466a982e264cc89b00679d8da68b88afa9c546a6f2'
  },
  '1.0.20': {
    file: 'v1.0.20.sql',
    sha256: '7c73684cf1b65faca7a1b98cc08f854a0edc05af2ae8e52b7ea4bb02c7211912'
  },
  '1.0.21': {
    file: 'v1.0.21.sql',
    sha256: '7105535fd563702cb3d5355dfb56c78c5ffeadd3b5a88d9952479a20942712f3'
  },
  '1.0.22': {
    file: 'v1.0.22.sql',
    sha256: '525969ae6652f754654fa2c96fa3b6085ca99896e05a0ba5199ffe995eec1deb'
  },
  '1.0.23': {
    file: 'v1.0.23.sql',
    sha256: '3b2dccfe66077e7e6fde4958861145a88553a719377029595ff34a4fbcb46378'
  },
  '1.0.24': {
    file: 'v1.0.24.sql',
    sha256: '29c4c8b01ee906aba6418d5d52845f303e931f50734c41a09cfe05f968d32546'
  },
  '1.0.25': {
    file: 'v1.0.25.sql',
    sha256: 'd5cbcb3e8c95d868ed3c7eab16ca3b620f6464c896f84c92ecc041abd5da08fc'
  },
  '1.0.26': {
    file: 'v1.0.26.sql',
    sha256: 'c9201a534abefa862a28d640305f97e6c77c21747d794dcabdf50b2e03574317'
  },
  '1.0.27': {
    file: 'v1.0.27.sql',
    sha256: 'f4974dffd5e0c7a926a4df17c1e409a38e0f6c7a9805703e347a58210778dd99'
  },
  '1.0.28': {
    file: 'v1.0.28.sql',
    sha256: '3a13e901e229afcc698074ecb2df4d9346d4d013c4a7164e11833b1783ae7d6f'
  },
  '1.0.29': {
    file: 'v1.0.29.sql',
    sha256: '1fb411f7c5cf84bd4a4f37f17a29749506deebba4a0ff4f8ad9901775a35d3df'
  },
  '1.0.30': {
    file: 'v1.0.30.sql',
    sha256: '9de07cd9e317670c0cec297bea7ebfe8216d53e1ab1b7554c11980d0edf5c316',
    execution: 'owner_manual',
    reason: 'Migration v1.0.30 altera policies em storage.objects. Em projetos Supabase hospedados, esse tipo de relacao costuma exigir execucao manual no SQL Editor como owner do banco.'
  },
  '1.0.31': {
    file: 'v1.0.31.sql',
    sha256: 'c349c0c4f39fd3afaaebfd08d8850ea98541ae745a12a55a75fc0d19a539ce2d'
  },
  '1.0.32': {
    file: 'v1.0.32.sql',
    sha256: 'aefa6007576c1e4cdee39fc90d213a91fde47af9bcedc13c354061f0ade62a3a'
  },
  '1.0.33': {
    file: 'v1.0.33.sql',
    sha256: 'cb3b6db30f51da3c23241c0f070a713fb99ded173b76add40f951479f1ff59e3'
  },
  '1.0.34': {
    file: 'v1.0.34.sql',
    sha256: '2a3c6062362ec4d4e300ec11b96c9557b945a9f04a8c4e6e0eaeee78c93a60ad'
  },
  '1.0.35': {
    file: 'v1.0.35.sql',
    sha256: '05c4276e574f7b2857ee13b292c2c4760a9175f062e4390f1145f63cfe53fa23'
  },
  '1.0.36': {
    file: 'v1.0.36.sql',
    sha256: '239666172289df3ea1f3c3f672e0c27e8f669b5b1b77fc12b00e202739f9b58b'
  },
  '1.0.37': {
    file: 'v1.0.37.sql',
    sha256: '349f7a7b91e8b7bdf63b775bffd90590530586353d53b776782286bc04e2ec44'
  },
  '1.0.38': {
    file: 'v1.0.38.sql',
    sha256: '2b17c5b6112b344831d7fa965ea1abad54ff57fde4cfc5225b61dd9ecdac7d2e',
    execution: 'owner_manual',
    reason: 'Migration de seguranca cria RPC SECURITY DEFINER e politicas RLS. Deve ser aplicada pelo owner no SQL Editor antes do deploy que passa a exigir a aprovacao TOTP.'
  },
  '1.0.39': {
    file: 'v1.0.39.sql',
    sha256: '8da6dd593e3100d0fdfcfef4d32a693782258cd90564d0799b9695426b91b403'
  },
  '1.0.40': {
    file: 'v1.0.40.sql',
    sha256: '38d92a87bbdf27d5288d61080631df919cd0f84a321c2c81cc829c3c06d48157'
  },
  '1.0.41': {
    file: 'v1.0.41.sql',
    sha256: 'ca93d46fbc5eeb835bf5c6c89a977aa594efd5d29162ca766bef4627855567f0',
    execution: 'owner_manual',
    reason: 'Migration de contrato e seguranca dos templates de email da plataforma. Deve ser aplicada pelo Proprietario no SQL Editor do Supabase para garantir que o RLS fique restrito a master_admin.'
  },
  '1.0.42': {
    file: 'v1.0.42.sql',
    sha256: '17332640fb8f703a2707634ee881670ccdfb8ea4d3b651d1af008be6a10772e2',
    execution: 'owner_manual',
    reason: 'Migration aditiva do catalogo comercial. Deve ser aplicada pelo Proprietario no SQL Editor para criar product_type/service_type e preservar os aliases legados de upgrade.'
  },
  '1.0.43': {
    file: 'v1.0.43.sql',
    sha256: '82596eab9439d7edebd2d87b3961127f8e5af04da4bd32d0cb4b24041b39acb2',
    execution: 'owner_manual',
    reason: 'Migration de enforcement do catalogo comercial. Deve ser aplicada pelo Proprietario no SQL Editor para impedir que cliente/parceiro criem upgrades e para limitar servicos de instalacao a Proprietario/Parceiro elegivel.'
  },
  '1.0.44': {
    file: 'v1.0.44.sql',
    sha256: 'e3cab80b08d0855db88a09f4da1260d4107b22d3ce1bcf15a5808536b242ceed',
    execution: 'owner_manual',
    reason: 'Migration de contrato do catalogo comercial. Deve ser aplicada pelo Proprietario no SQL Editor para garantir que produtos de upgrade usem somente entrega automatica de entitlement.'
  },
  '1.0.45': {
    file: 'v1.0.45.sql',
    sha256: '424f1311efd4d7bd2afb75f7c35d07c6d08c0cc893192aeffad13ffff110f30a',
    execution: 'owner_manual',
    reason: 'Migration de seguranca do catalogo comercial. Deve ser aplicada pelo Proprietario para impedir que o browser altere accounts.plan_type e simule o Plano Parceiro localmente.'
  }
};

export function compareVersions(v1: string, v2: string): number {
  const p1 = String(v1 || UNKNOWN_SCHEMA_VERSION).split('.').map(Number);
  const p2 = String(v2 || UNKNOWN_SCHEMA_VERSION).split('.').map(Number);

  for (let index = 0; index < Math.max(p1.length, p2.length); index += 1) {
    const left = p1[index] || 0;
    const right = p2[index] || 0;
    if (left < right) return -1;
    if (left > right) return 1;
  }

  return 0;
}

export function listApprovedMigrationVersions() {
  return Object.keys(APPROVED_MIGRATION_ALLOWLIST).sort(compareVersions);
}

export function getPendingApprovedMigrationVersions(installedVersion: string) {
  return listApprovedMigrationVersions().filter((version) =>
    compareVersions(version, installedVersion || UNKNOWN_SCHEMA_VERSION) > 0
    && compareVersions(version, CURRENT_SCHEMA_VERSION) <= 0
  );
}
