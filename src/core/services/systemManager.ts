import { supabase } from './supabase';
import { SystemInfo, SystemFeature, SystemUpdateLog } from '../types';
import { SCHEMA_VERSION } from '../config/version';
import { GITHUB_UPDATE_CONFIG } from '../config/github';

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

    const response = await fetch('/api/central-proxy?endpoint=system-update-runner', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`
      },
      body: JSON.stringify({
        action,
        installation_id: info.github_installation_id,
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
      throw new Error(data.message || data.error || 'Falha no serviÃ§o central de atualizaÃ§Ã£o.');
    }

    return data;
  },

  async logLocalUpdate(action: string, status: string, message: string, filesAffected: any = null) {
    try {
      await supabase.from('system_updates_log').insert({
        action,
        status,
        message,
        files_affected: filesAffected || {}
      });
    } catch (error) {
      console.warn('[SystemManager] Could not write update log:', error);
    }
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

        if (response.ok) {
          const json = await response.json();
          if (json?.data) return json.data as SystemInfo;
        }
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
  async syncSystemFiles(): Promise<{ success: boolean; message?: string; filesUpdated?: number }> {
    try {
      const centralResult = await this.invokeCentralUpdateRunner('sync');
      await this.logLocalUpdate('sync', 'success', centralResult.message || 'Sincronizacao concluida pela Central.', {
        commit_hash: centralResult.commitHash,
        backup_branch: centralResult.backupBranch,
        files_updated: centralResult.filesUpdated
      });

      return {
        success: true,
        message: centralResult.message,
        filesUpdated: centralResult.filesUpdated
      };
    } catch (err: any) {
      console.error('[SystemManager] Sync failed:', err);
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
        backup_branch: backupBranch
      });

      return {
        success: true,
        message: centralResult.message
      };
    } catch (err: any) {
      console.error('[SystemManager] Rollback failed:', err);
      return { success: false, message: err.message };
    }
  },

  /**
   * Checks if database migrations are required based on the schema version in the code
   */
  async checkMigrationsRequired(): Promise<boolean> {
    const info = await this.getSystemInfo();
    if (!info) return false;

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

    return false;
  },

  /**
   * Runs all pending migrations in order
   */
  async runPendingMigrations(): Promise<{ success: boolean; applied: string[]; error?: string }> {
    try {
      const info = await this.getSystemInfo();
      if (!info) return { success: false, applied: [], error: 'Could not fetch system info' };

      const currentDbVersion = info.db_version;
      const applied: string[] = [];

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
        this.compareVersions(m.version, currentDbVersion) > 0 && 
        this.compareVersions(m.version, SCHEMA_VERSION) <= 0
      );

      console.log(`[SystemManager] Found ${pending.length} pending migrations from v${currentDbVersion} to v${SCHEMA_VERSION}`);

      for (const migration of pending) {
        console.log(`[SystemManager] Applying migration v${migration.version}...`);
        const success = await this.runMigration(
          migration.version,
          migration.sql,
          `Auto-migration from codebase discover`
        );

        if (!success) {
          return { 
            success: false, 
            applied, 
            error: `Migration v${migration.version} failed. Check schema_migrations for details.` 
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
      const row = {
        version,
        description,
        success,
        execution_time_ms: timeMs,
        error_log: error
      };

      const { error: upsertError } = await supabase
        .from('schema_migrations')
        .upsert(row, { onConflict: 'version' });

      if (upsertError) {
        const { error: insertError } = await supabase.from('schema_migrations').insert(row);
        if (insertError) {
          console.warn('[SystemManager] Could not write migration log:', insertError);
        }
      }

      if (success) {
        // Update the main system_info table
        const { data: info } = await supabase.from('system_info').select('id').single();
        if (info) {
          await supabase.from('system_info').update({
            db_version: version,
            last_update_at: new Date().toISOString()
          }).eq('id', info.id);
        }
      }
    } catch (err) {
      console.error('[SystemManager] Failed to log migration:', err);
    }
  },

  /**
   * Executes a raw SQL query via the secure exec_sql function
   */
  async runMigration(version: string, sql: string, description: string): Promise<boolean> {
    const startTime = Date.now();
    try {
      console.log(`[SystemManager] Running migration ${version}...`);

      if (await this.verifyMigrationState(version)) {
        console.log(`[SystemManager] Migration ${version} already reflected in schema.`);
        await this.logMigration(version, `${description} (schema already current)`, true, Date.now() - startTime);
        return true;
      }

      const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });

      if (error || !(data as any)?.success) {
        const errorMsg = error?.message || (data as any)?.error || 'Unknown error';
        console.error(`[SystemManager] Migration ${version} failed:`, errorMsg);
        await this.logMigration(version, description, false, Date.now() - startTime, errorMsg);
        return false;
      }

      console.log(`[SystemManager] Migration ${version} successful!`);
      await this.logMigration(version, description, true, Date.now() - startTime);
      return true;
    } catch (err: any) {
      console.error(`[SystemManager] Unexpected migration error for ${version}:`, err);
      await this.logMigration(version, description, false, Date.now() - startTime, err.message);
      return false;
    }
  },

  /**
   * Fetches the history of system updates and snapshots
   */
  async getUpdateHistory(): Promise<SystemUpdateLog[]> {
    try {
      const { data, error } = await supabase
        .from('system_updates_log')
        .select('*')
        .order('executed_at', { ascending: false })
        .limit(10);

      if (error) {
        console.error('[SystemManager] Error fetching update history:', error);
        return [];
      }

      return (data || []) as SystemUpdateLog[];
    } catch (err) {
      console.error('[SystemManager] Unexpected error fetching update history:', err);
      return [];
    }
  },

  /**
   * Performs a schema integrity audit
   */
  async performSchemaAudit(): Promise<{ is_healthy: boolean; drifts: any[]; checked_at: string }> {
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

    return {
      is_healthy: drifts.length === 0,
      drifts,
      checked_at: new Date().toISOString()
    };
  }
};
