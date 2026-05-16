import { supabase } from './supabase';

export async function resendOrderAccessEmail(orderId: string) {
  const { data: { session } } = await supabase.auth.getSession();
  const accessToken = session?.access_token;
  if (!accessToken) throw new Error('Sessao expirada. Entre novamente para reenviar o acesso.');

  const response = await fetch('/api/system?action=resend-order-access', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ orderId }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || 'Nao foi possivel reenviar o email de acesso.');
  }

  return data;
}
