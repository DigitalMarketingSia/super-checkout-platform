import { supabase } from './supabase';
import { SystemInfo, SystemFeature, SystemUpdateLog } from '../types';
import { APP_VERSION, SCHEMA_VERSION } from '../config/version';
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
      const info = await this.getSystemInfo();
      if (!info) return false;

      const { error } = await supabase
        .from('system_info')
        .update({
          github_installation_id: installationId,
          github_repository: repository,
          last_update_at: new Date().toISOString()
        })
        .eq('id', info.id);

      if (error) {
        console.error('[SystemManager] Update error details:', error);
      }

      return !error;
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
      console.warn('[SystemManager] Central update test failed, trying legacy local runner:', centralErr?.message || centralErr);
    }

    try {
      const { data, error } = await supabase.functions.invoke('system-update-runner', {
        body: { action: 'test' }
      });

      if (error) {
        throw new Error(error.message || 'Erro na Edge Function');
      }

      return {
        success: data.success,
        message: data.message || data.error
      };
    } catch (err: any) {
      console.error('[SystemManager] Connection test failed:', err);
      return { success: false, message: err.message };
    }
  },

  /**
   * Triggers the real file synchronization
   */
  async syncSystemFiles(): Promise<{ success: boolean; message?: string; filesUpdated?: number }> {
    try {
      const centralResult = await this.invokeCentralUpdateRunner('sync');
      await this.logLocalUpdate('sync', 'success', centralResult.message || 'SincronizaÃ§Ã£o concluÃ­da pela Central.', {
        commit_hash: centralResult.commitHash,
        backup_branch: centralResult.backupBranch,
        files_updated: centralResult.filesUpdated
      });

      return {
        success: true,
        message: centralResult.message,
        filesUpdated: centralResult.filesUpdated
      };
    } catch (centralErr: any) {
      console.warn('[SystemManager] Central sync failed, trying legacy local runner:', centralErr?.message || centralErr);
    }

    try {
      const { data, error } = await supabase.functions.invoke('system-update-runner', {
        body: { action: 'sync' }
      });

      if (error) {
        throw new Error(error.message || 'Erro na sincronização');
      }

      return {
        success: data.success,
        message: data.message,
        filesUpdated: data.filesUpdated
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
      await this.logLocalUpdate('rollback', 'success', centralResult.message || 'Rollback concluÃ­do pela Central.', {
        backup_branch: backupBranch
      });

      return {
        success: true,
        message: centralResult.message
      };
    } catch (centralErr: any) {
      console.warn('[SystemManager] Central rollback failed, trying legacy local runner:', centralErr?.message || centralErr);
    }

    try {
      const { data, error } = await supabase.functions.invoke('system-update-runner', {
        body: { 
          action: 'rollback',
          backupBranch
        }
      });

      if (error) {
        throw new Error(error.message || 'Erro no rollback');
      }

      return {
        success: data.success,
        message: data.message
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
      await supabase.from('schema_migrations').insert({
        version,
        description,
        success,
        execution_time_ms: timeMs,
        error_log: error
      });

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
      const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });

      if (error || !data.success) {
        const errorMsg = error?.message || data?.error || 'Unknown error';
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
    try {
      const { data, error } = await supabase.rpc('check_schema_integrity');
      
      if (error) {
        throw new Error(error.message);
      }

      return data;
    } catch (err: any) {
      console.error('[SystemManager] Schema audit failed:', err);
      return { is_healthy: false, drifts: [{ type: 'audit_error', message: err.message }], checked_at: new Date().toISOString() };
    }
  }
};
