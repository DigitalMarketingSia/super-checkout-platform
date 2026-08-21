type RetiredPagbankGateway = {
  id?: string | null;
};

type RetiredPagbankTokenResult = {
  accessToken: string;
};

export async function resolvePagbankAccessToken(_params: {
  supabaseAdmin: any;
  gateway: RetiredPagbankGateway;
  reason: 'payment' | 'status';
}): Promise<RetiredPagbankTokenResult> {
  const error = new Error('PagBank is retired and cannot resolve payment credentials.');
  (error as Error & { code?: string }).code = 'GATEWAY_RETIRED';
  throw error;
}
