/**
 * The v1.0.36 migration replaces broad public table reads with sanitised
 * views. During a rolling Vercel deployment, a newly deployed browser can
 * briefly arrive before the migration has created those views. This helper
 * permits a narrowly-scoped compatibility read only for that rollout state.
 */
export const isPublicViewUnavailable = (error: { code?: string | null; message?: string | null } | null | undefined) => {
  if (!error) return false;

  return error.code === 'PGRST205'
    || error.code === '42P01'
    || (/public_(products|business_settings|domains|member_areas)/i.test(error.message || '')
      && /schema cache|does not exist|not found/i.test(error.message || ''));
};
