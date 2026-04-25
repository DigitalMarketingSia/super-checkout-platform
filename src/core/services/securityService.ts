import { createClient } from '@supabase/supabase-js';

/**
 * SERVICE: SECURITY (BACKEND-ONLY)
 * 
 * Este serviço lida com a detecção de fraude, rate limiting por IP 
 * e auditoria de eventos suspeitos.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || '';

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

export class SecurityService {
  /**
   * Registra uma violação de segurança no banco de dados.
   */
  async logViolation(ip: string, type: 'price_manipulation' | 'invalid_checkout' | 'rate_limit_exceeded' | 'invalid_bump' | 'auth_brute_force' | 'suspicious_activity', metadata: any = {}) {
    console.error(`[SecurityViolation] IP: ${ip} | Type: ${type}`, metadata);
    
    // Determina a severidade (INFO, WARNING, CRITICAL, FATAL) baseada no tipo de evento
    let severity = 'WARNING';
    if (['price_manipulation'].includes(type)) severity = 'CRITICAL';
    if (['invalid_checkout', 'invalid_bump'].includes(type)) severity = 'CRITICAL';
    if (['rate_limit_exceeded', 'auth_brute_force'].includes(type)) severity = 'WARNING';

    try {
      const insertData: any = {
          event_type: type,
          severity: severity,
          ip_address: ip,
          metadata: { ...metadata, origin: 'edge_security_service' }
      };

      // Adiciona user_id caso exista (usuário autenticado ou merchant alvo)
      if (metadata.user_id && metadata.user_id !== '00000000-0000-0000-0000-000000000000') {
        insertData.user_id = metadata.user_id;
      } else if (metadata.owner_id) {
        insertData.user_id = metadata.owner_id;
      }

      // IMPORTANTE: Não há mais exigência de user_id. Rastreia até mesmo ataques anônimos.
      const { error } = await supabaseAdmin
        .from('security_events')
        .insert(insertData);
          
      if (error) console.warn('[SecurityService] Audit log DB insertion failed:', error.message);
      
    } catch (err) {
      console.error('[SecurityService] Unexpected log error:', err);
    }
  }

  /**
   * Verifica se o IP excedeu o limite de tentativas inválidas nos últimos 10 minutos.
   * Modificado para comportamento FAIL-CLOSED (bloqueia em caso de falha da DB).
   */
  async isRateLimited(ip: string, limit: number = 5): Promise<boolean> {
    try {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      
      const { count, error } = await supabaseAdmin
        .from('security_events')
        .select('*', { count: 'exact', head: true })
        .eq('ip_address', ip)
        .in('event_type', ['rate_limit_exceeded', 'auth_brute_force', 'invalid_checkout'])
        .gt('created_at', tenMinutesAgo);

      if (error) {
        // [FAIL-CLOSED] Se o Supabase cair ou negar permissão, BLOQUEIE a requisição.
        // É melhor gerar falsos positivos de negação de acesso do que permitir a entrada sem limites em downtime.
        console.error('[SecurityService] Rate limit DB check error. Deploying FAIL-CLOSED:', error.message);
        return true; 
      }

      return (count || 0) >= limit;
    } catch (err) {
      // [FAIL-CLOSED]
      console.error('[SecurityService] Rate limit unexpected error. Deploying FAIL-CLOSED:', err);
      return true;
    }
  }
}

export const securityService = new SecurityService();
