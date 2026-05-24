export const CURRENT_SCHEMA_VERSION = '1.0.13';
export const UNKNOWN_SCHEMA_VERSION = '0.0.0';

export const APPROVED_MIGRATION_ALLOWLIST: Record<string, { file: string; sha256: string }> = {
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
