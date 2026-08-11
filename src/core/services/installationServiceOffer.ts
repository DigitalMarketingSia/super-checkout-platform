import { supabase } from './supabase';

/**
 * Re-resolves the selected installation-service offer after a checkout or
 * product is changed. The browser supplies only its session; the server
 * derives the product, checkout URL and Central installation identity.
 */
export async function syncInstallationServiceOffer(productId?: string | null) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;

  const accessToken = sessionData.session?.access_token;
  if (!accessToken) {
    throw new Error('Sua sessão expirou. Entre novamente e tente publicar a oferta de instalação.');
  }

  const response = await fetch('/api/admin?action=sync-installation-service-offer', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ productId: productId || null }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success !== true) {
    throw new Error(payload?.error || 'Não foi possível sincronizar a oferta de instalação no Portal.');
  }
  return payload as { success: true; active: boolean };
}
