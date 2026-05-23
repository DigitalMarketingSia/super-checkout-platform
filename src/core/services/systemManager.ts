import { supabase } from './supabase';
import { SystemInfo, SystemFeature, SystemUpdateLog } from '../types';
import { SCHEMA_VERSION } from '../config/version';
import { GITHUB_UPDATE_CONFIG } from '../config/github';
import { getEnv } from '../utils/env';

// Import all migrations from the migrations directory
// We use eager: true to have the content immediately available
const migrations = import.meta.glob('../../migrations/*.sql', { query: '?raw', import: 'default', eager: true });

export const SystemManager = {
  async invokeCentralUpdateRunner(action: 'test' | 'sync' | 'rollback', payload: Record<string, any> = {}) {
    const info = await this.getSystemInfo();
    if (!info?.github_installation_id || !info?.github_repository) {
      throw new Error('Configure o GitHub App e o repositÃ³rio antes de testar ou sincronizar.');
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error('SessÃ£o expirada. Entre novamente para continuar.');
    }

    const localInstallationId = typeof window !== 'undefined'
      ? window.localStorage.getItem('installation_id')
      : null;
    const licenseKey = getEnv('VITE_LICENSE_KEY') || getEnv('LICENSE_KEY');
    const currentDomain = typeof window !== 'undefined' ? window.location.hostname : undefined;

    const response = await fetch('/api/central-proxy?endpoint=system-update-runner', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`
      },
      body: JSON.stringify({
        action,
        installation_id: info.github_installation_id,
        local_installation_id: localInstallationId,
        license_key: licenseKey,
        current_domain: currentDomain,
        repository: info.github_repository,
        source_repository: GITHUB_UPDATE_CONFIG.SOURCE_REPOSITORY,
        ...payload
      })
    });

    const raw = await response.text();
    const data = raw ? (() => {
      try {
        return JSON.parse(raw);
      } catch {
        return { message: raw };
      }
    })() : {};

    if (!response.ok || data.success === false) {
      if (data.code === 'CENTRAL_SECRET_MISMATCH') {
        throw new Error(data.error || 'Falha de autenticaÃ§Ã£o com a Central. Atualize CENTRAL_SHARED_SECRET na Vercel desta instalaÃ§Ã£o e tente novamente.');
      }

      throw new Error(data.message || data.error || 'Falha no serviÃ§o central de atualizaÃ§Ã£o.');
    }

    return data;
  },

  async logLocalUpdate(action: string, status: string, message: string, filesAffected: any = null): Promise<boolean> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        console.warn('[SystemManager] Could not write update log: missing admin session.');
        return false;
      }

      const response = await fetch('/api/admin/update-log', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          action,
          status,
          message,
          files_affected: filesAffected || {}
        })
      });

      if (response.ok) return true;

      const data = await response.json().catch(() => ({}));
      console.warn('[SystemManager] Server update log failed:', data.error || response.statusText);
      return false;
    } catch (error) {
      console.warn('[SystemManager] Could not write update log:', error);
      return false;
    }
  },

  getPendingMigrationVersions(info: Pick<SystemInfo, 'pending_migrations'> | null | undefined): string[] {
    return Array.isArray(info?.pending_migrations)
      ? info.pending_migrations.filter((version) => typeof version === 'string' && version.trim().length > 0)
      : [];
  },

  /**
   * Fetches the current system version from the database
   */
  async getSystemInfo(): Promise<SystemInfo | null> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        const response = await fetch('/api/admin/system-info', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${session.access_token}`
          }
        });

        const json = await response.json().catch(() => ({}));

      if (response.ok) {
        if (json?.data) return json.data as SystemInfo;
      }

      if (json?.error) {
        console.warn('[SystemManager] Server system info failed:', json.error);

        const { data, error } = await supabase
          .from('system_info')
          .select('*')
          .single();

        if (error) {
          console.error('[SystemManager] Error fetching fallback system info:', error);
          return null;
        }

        return {
          ...(data as SystemInfo),
          reported_db_version: data.db_version,
          latest_completed_migration: null,
          pending_migrations: [],
          pending_migration_count: 0,
          database_status: 'unverified',
          system_info_present: true,
        };
      }

      console.warn('[SystemManager] Server system info failed:', response.statusText);
    }

      const { data, error } = await supabase
        .from('system_info')
        .select('*')
        .single();

      if (error) {
        console.error('[SystemManager] Error fetching system info:', error);
        return null;
      }

      return data as SystemInfo;
    } catch (err) {
      console.error('[SystemManager] Unexpected error:', err);
      return null;
    }
  },

  /**
   * Fetches the current account plan type
   */
  async getPlanType(): Promise<string> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return 'free';

      const { data, error } = await supabase
        .from('accounts')
        .select('plan_type')
        .eq('owner_user_id', user.id)
        .single();
      
      if (error) {
        console.error('[SystemManager] Error fetching plan type:', error);
        return 'free';
      }

      return data?.plan_type || 'free';
    } catch (err) {
      console.error('[SystemManager] Unexpected error fetching plan type:', err);
      return 'free';
    }
  },

  /**
   * Fetches all feature flags
   */
  async getFeatures(): Promise<SystemFeature[]> {
    try {
      const { data, error } = await supabase
        .from('system_features')
        .select('*')
        .order('feature_key');

      if (error) {
        console.error('[SystemManager] Error fetching features:', error);
        return [];
      }

      return data || [];
    } catch (err) {
      console.error('[SystemManager] Unexpected error fetching features:', err);
      return [];
    }
  },

  /**
   * Checks if a specific feature is enabled
   */
  async isFeatureEnabled(key: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('system_features')
        .select('is_enabled')
        .eq('feature_key', key)
        .single();

      if (error) return false;
      return !!data?.is_enabled;
    } catch (err) {
      return false;
    }
  },

  /**
   * Updates GitHub App Installation data
   */
  async updateGitHubIntegration(installationId: string, repository: string): Promise<boolean> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('SessÃ£o expirada.');

      const response = await fetch('/api/admin/system-info', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          github_installation_id: installationId,
          github_repository: repository
        })
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Erro ao atualizar integraÃ§Ã£o.');
      }

      return true;
    } catch (err) {
      console.error('[SystemManager] Failed to update GitHub integration:', err);
      return false;
    }
  },

  /**
   * Triggers the GitHub connection test via Edge Function
   */
  async testGitHubConnection(): Promise<{ success: boolean; message?: string }> {
    try {
      const centralResult = await this.invokeCentralUpdateRunner('test');
      return {
        success: true,
        message: centralResult.message || 'GitHub App autenticado com sucesso pela Central!'
      };
    } catch (centralErr: any) {
      console.error('[SystemManager] Connection test failed:', centralErr);
      return { success: false, message: centralErr.message };
    }
  },

  /**
   * Triggers the real file synchronization
   */
  async syncSystemFiles(): Promise<{ success: boolean; message?: string; filesUpdated?: number; historyLogged?: boolean }> {
    try {
      const centralResult = await this.invokeCentralUpdateRunner('sync');
      if ((centralResult.filesUpdated || 0) > 0 && !centralResult.backupBranch) {
        throw new Error('A Central nao confirmou a branch de backup. Sincronizacao abortada.');
      }

      const historyLogged = await this.logLocalUpdate('sync', 'success', centralResult.message || 'Sincronizacao concluida pela Central.', {
        commit_hash: centralResult.commitHash,
        backup_branch: centralResult.backupBranch,
        files_updated: centralResult.filesUpdated,
        files_removed: centralResult.filesRemoved || 0
      });

      return {
        success: true,
        message: centralResult.message,
        filesUpdated: centralResult.filesUpdated,
        historyLogged
      };
    } catch (err: any) {
      console.error('[SystemManager] Sync failed:', err);
      await this.logLocalUpdate('sync', 'failed', err.message || 'Falha na sincronizacao de codigo.');
      return { success: false, message: err.message };
    }
  },

  /**
   * Triggers the system rollback to a previous branch
   */
  async rollbackSystemFiles(backupBranch: string): Promise<{ success: boolean; message?: string }> {
    try {
      const centralResult = await this.invokeCentralUpdateRunner('rollback', { backupBranch });
      await this.logLocalUpdate('rollback', 'success', centralResult.message || 'Rollback concluido pela Central.', {
        backup_branch: backupBranch,
        commit_hash: centralResult.commitHash || null
      });

      return {
        success: true,
        message: centralResult.message
      };
    } catch (err: any) {
      console.error('[SystemManager] Rollback failed:', err);
      await this.logLocalUpdate('rollback', 'failed', err.message || 'Falha ao reverter codigo.', {
        backup_branch: backupBranch
      });
      return { success: false, message: err.message };
    }
  },

  /**
   * Checks if database migrations are required based on the schema version in the code
   */
  async checkMigrationsRequired(): Promise<boolean> {
    const info = await this.getSystemInfo();
    if (!info) return false;

    if (info.database_status === 'unverified') return true;

    const pendingVersions = this.getPendingMigrationVersions(info);
    if (pendingVersions.length > 0) return true;

    return this.compareVersions(info.db_version, SCHEMA_VERSION) < 0;
  },

  /**
   * Helper to compare semantic versions (basic implementation)
   * Returns:
   *   -1 if v1 < v2
   *    0 if v1 == v2
   *    1 if v1 > v2
   */
  compareVersions(v1: string, v2: string): number {
    const p1 = v1.split('.').map(Number);
    const p2 = v2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
      const n1 = p1[i] || 0;
      const n2 = p2[i] || 0;
      if (n1 < n2) return -1;
      if (n1 > n2) return 1;
    }
    return 0;
  },

  async verifyMigrationState(version: string): Promise<boolean> {
    const hasColumn = async (table: string, column: string) => {
      const { error } = await supabase.from(table).select(column).limit(1);
      return !error;
    };
    const hasProtectedColumn = async (table: string, column: string) => {
      const { error } = await supabase.from(table).select(column).limit(1);
      if (!error) return true;

      const message = String(error.message || '').toLowerCase();
      return error.code === '42501'
        || message.includes('permission denied')
        || message.includes('row-level security')
        || message.includes('rls');
    };

    if (version === '1.0.1') {
      return hasColumn('system_info', 'testing_evolution');
    }

    if (version === '1.0.2') {
      const [hasSystemTemplateLanguage, hasBusinessTemplateLanguage] = await Promise.all([
        hasColumn('system_email_templates', 'language'),
        hasColumn('email_templates', 'language')
      ]);
      return hasSystemTemplateLanguage && hasBusinessTemplateLanguage;
    }

    if (version === '1.0.3') {
      return hasColumn('public_gateways', 'public_key');
    }

    if (version === '1.0.4') {
      return hasColumn('profiles', 'full_name');
    }

    if (version === '1.0.5') {
      const [hasWebhooks, hasWebhookLogs] = await Promise.all([
        hasColumn('webhooks', 'url'),
        hasColumn('webhook_logs', 'response_status')
      ]);
      return hasWebhooks && hasWebhookLogs;
    }

    if (version === '1.0.6') {
      return hasColumn('public_gateways', 'public_key');
    }

    if (version === '1.0.7') {
      const [hasTokenHash, hasEncryptedPayload] = await Promise.all([
        hasProtectedColumn('two_factor_challenges', 'token_hash'),
        hasProtectedColumn('two_factor_challenges', 'session_payload_encrypted')
      ]);
      return hasTokenHash && hasEncryptedPayload;
    }

    if (version === '1.0.8') {
      const [hasLastLoginAt, hasBannerDescription] = await Promise.all([
        hasColumn('profiles', 'last_login_at'),
        hasColumn('member_areas', 'banner_description')
      ]);
      return hasLastLoginAt && hasBannerDescription;
    }

    if (version === '1.0.9') {
      return hasColumn('profiles', 'is_blocked');
    }

    if (version === '1.0.10') {
      const { data, error } = await supabase
        .from('email_templates')
        .select('event_type')
        .in('event_type', ['ORDER_DIRECT_DELIVERY', 'ORDER_MEMBER_ACCESS']);
      if (error) return false;
      const templateTypes = new Set((data || []).map((template: any) => template.event_type));
      return templateTypes.has('ORDER_DIRECT_DELIVERY') && templateTypes.has('ORDER_MEMBER_ACCESS');
    }

    return false;
  },

  /**
   * Runs all pending migrations in order
   */
  async runPendingMigrations(): Promise<{ success: boolean; applied: string[]; error?: string; failedVersion?: string }> {
    try {
      const info = await this.getSystemInfo();
      if (!info) return { success: false, applied: [], error: 'Could not fetch system info' };
      if (info.database_status === 'unverified' && this.getPendingMigrationVersions(info).length === 0) {
        return {
          success: false,
          applied: [],
          error: 'Nao foi possivel comprovar o estado real do schema. Rode a auditoria do banco antes de aplicar novas migrations.'
        };
      }

      const currentDbVersion = info.db_version;
      const applied: string[] = [];
      const explicitPendingVersions = new Set(this.getPendingMigrationVersions(info));

      // Get all migration files, extract version, and sort them
      const availableMigrations = Object.keys(migrations)
        .map(path => {
          const match = path.match(/v(\d+\.\d+\.\d+)\.sql/);
          return {
            version: match ? match[1] : '0.0.0',
            sql: migrations[path] as string,
            path
          };
        })
        .filter(m => m.version !== '0.0.0')
        .sort((a, b) => this.compareVersions(a.version, b.version));

      // Filter pending migrations (v > currentDbVersion)
      const pending = availableMigrations.filter(m => 
        explicitPendingVersions.size > 0
          ? explicitPendingVersions.has(m.version)
          : (
            this.compareVersions(m.version, currentDbVersion) > 0
            && this.compareVersions(m.version, SCHEMA_VERSION) <= 0
          )
      );

      console.log(`[SystemManager] Found ${pending.length} pending migrations from v${currentDbVersion} to v${SCHEMA_VERSION}`);

      for (const migration of pending) {
        console.log(`[SystemManager] Applying migration v${migration.version}...`);
        const result = await this.runMigration(
          migration.version,
          migration.sql,
          'Atualizacao aprovada aplicada pelo painel administrativo'
        );

        if (!result.success) {
          return { 
            success: false, 
            applied, 
            failedVersion: migration.version,
            error: result.error || `Migration v${migration.version} failed.`
          };
        }
        applied.push(migration.version);
      }

      return { success: true, applied };
    } catch (err: any) {
      console.error('[SystemManager] runPendingMigrations failed:', err);
      return { success: false, applied: [], error: err.message };
    }
  },

  /**
   * Logs a migration execution
   */
  async logMigration(version: string, description: string, success: boolean, timeMs: number, error?: string) {
    try {
      await this.logLocalUpdate('migration', success ? 'success' : 'failed', description, {
        version,
        execution_time_ms: timeMs,
        error: error || null
      });
    } catch (err) {
      console.error('[SystemManager] Failed to log migration:', err);
    }
  },

  /**
   * Requests a pre-approved migration by version. Raw SQL never leaves the server allowlist.
   */
  async runMigration(version: string, _sql: string, description: string): Promise<{ success: boolean; error?: string }> {
    const startTime = Date.now();
    try {
      console.log(`[SystemManager] Running migration ${version}...`);

      if (await this.verifyMigrationState(version)) {
        console.log(`[SystemManager] Migration ${version} already reflected in schema.`);
        await this.logMigration(version, `${description} (schema already current)`, true, Date.now() - startTime);
        return { success: true };
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Admin session required to run migrations.');
      }

      const response = await fetch('/api/admin?action=run-migration', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ version })
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result?.success) {
        const detail = String(result?.detail || '').trim();
        const serverError = String(result?.error || response.statusText || 'Unknown error').trim();
        const errorMsg = detail && detail !== serverError
          ? `${serverError}: ${detail}`
          : serverError;
        console.error(`[SystemManager] Migration ${version} failed:`, errorMsg);
        await this.logMigration(version, description, false, Date.now() - startTime, errorMsg);
        return { success: false, error: errorMsg };
      }

      console.log(`[SystemManager] Migration ${version} successful!`);
      await this.logMigration(version, description, true, Date.now() - startTime);
      return { success: true };
    } catch (err: any) {
      console.error(`[SystemManager] Unexpected migration error for ${version}:`, err);
      await this.logMigration(version, description, false, Date.now() - startTime, err.message);
      return { success: false, error: err.message };
    }
  },

  /**
   * Fetches the history of system updates and snapshots
   */
  async getUpdateHistory(): Promise<SystemUpdateLog[]> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return [];

      const response = await fetch('/api/admin/update-log', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });
      const json = await response.json().catch(() => ({}));

      if (response.ok) {
        if (Array.isArray(json?.data)) return json.data as SystemUpdateLog[];
      }

      console.warn('[SystemManager] Server update history failed:', json.error || response.statusText);
      return [];
    } catch (err) {
      console.error('[SystemManager] Unexpected error fetching update history:', err);
      return [];
    }
  },

  /**
   * Performs a schema integrity audit
   */
  async performSchemaAudit(): Promise<{ is_healthy: boolean; drifts: any[]; checked_at: string }> {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      const response = await fetch('/api/admin/schema-audit', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });

      const json = await response.json().catch(() => ({}));

      if (response.ok && json?.data) {
        return json.data;
      }

      if (json?.error) {
        console.warn('[SystemManager] Server schema audit failed:', json.error);
        return {
          is_healthy: false,
          drifts: [{
            type: 'server_configuration_error',
            name: 'schema-audit',
            message: json.error,
          }],
          checked_at: new Date().toISOString()
        };
      }

      console.warn('[SystemManager] Server schema audit failed:', response.statusText);
    }

    const checks = [
      { table: 'system_info', columns: ['db_version', 'github_installation_id', 'github_repository'] },
      { table: 'schema_migrations', columns: ['version', 'success'] },
      { table: 'accounts', columns: ['owner_user_id', 'plan_type', 'status'] },
      { table: 'business_settings', columns: ['account_id', 'support_email', 'is_ready_to_sell'] },
      { table: 'licenses', columns: ['key', 'account_id', 'max_instances', 'status'] },
      { table: 'installations', columns: ['license_key', 'account_id', 'installation_id', 'status'] },
      { table: 'gateways', columns: ['provider', 'credentials', 'config', 'is_active'] },
      { table: 'public_gateways', columns: ['id', 'provider', 'public_key', 'config'] },
      { table: 'email_templates', columns: ['event_type', 'language', 'html_body'] },
      { table: 'system_email_templates', columns: ['event_type', 'language', 'html_body'] },
      { table: 'system_updates_log', columns: ['action', 'status', 'files_affected'] }
    ];

    const drifts: any[] = [];

    for (const check of checks) {
      const { error } = await supabase
        .from(check.table)
        .select(check.columns.join(','))
        .limit(1);

      if (error) {
        const message = error.message || 'Schema check failed';
        const missingColumn = check.columns.find(column => message.includes(`'${column}'`) || message.includes(` ${column} `));
        drifts.push({
          type: missingColumn ? 'column_missing' : 'schema_check_failed',
          name: check.table,
          column: missingColumn,
          expected_columns: check.columns,
          message
        });
      }
    }

    const info = await this.getSystemInfo();
    const pendingVersions = this.getPendingMigrationVersions(info);
    if (info?.database_status === 'unverified') {
      drifts.push({
        type: 'migration_state_unverified',
        name: 'schema_migrations',
        message: 'Nao foi possivel comprovar o estado real do schema pelo browser.'
      });
    } else if (pendingVersions.length > 0) {
      drifts.push({
        type: 'migration_pending',
        name: 'schema_migrations',
        versions: pendingVersions,
        message: `Migrations aprovadas pendentes: ${pendingVersions.join(', ')}`
      });
    }

    return {
      is_healthy: drifts.length === 0,
      drifts,
      checked_at: new Date().toISOString()
    };
  }
};
