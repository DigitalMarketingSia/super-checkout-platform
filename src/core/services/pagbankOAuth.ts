export interface PagBankOAuthTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
  account_id: string;
}

export class PagBankOAuthService {
  private static readonly OAUTH_URL_PRODUCTION = 'https://api.pagseguro.com/oauth2/token';
  private static readonly OAUTH_URL_SANDBOX = 'https://sandbox.api.pagseguro.com/oauth2/token';
  private static readonly AUTHORIZE_URL_PRODUCTION = 'https://connect.pagbank.com.br/oauth2/authorize';
  private static readonly AUTHORIZE_URL_SANDBOX = 'https://connect.sandbox.pagbank.com.br/oauth2/authorize';

  private static getOauthUrl(isSandbox: boolean): string {
    return isSandbox ? this.OAUTH_URL_SANDBOX : this.OAUTH_URL_PRODUCTION;
  }

  /**
   * Troca o authorization_code por um access_token
   */
  static async exchangeCodeForToken(
    code: string,
    redirectUri: string,
    clientId: string,
    clientSecret: string,
    authorizationToken: string,
    isSandbox: boolean = false
  ): Promise<PagBankOAuthTokenResponse> {
    const url = this.getOauthUrl(isSandbox);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authorizationToken}`,
        'X_CLIENT_ID': clientId,
        'X_CLIENT_SECRET': clientSecret,
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[PagBankOAuthService] Error exchanging code:", errorText);
      throw new Error(`Failed to exchange token: ${response.status} - ${errorText}`);
    }

    return response.json() as Promise<PagBankOAuthTokenResponse>;
  }

  /**
   * Gera a URL para redirecionar o usuário para a página de autorização do PagBank
   */
  static getAuthorizeUrl(
    clientId: string,
    redirectUri: string,
    scope: string,
    state: string,
    isSandbox: boolean = false
  ): string {
    const baseUrl = isSandbox 
      ? this.AUTHORIZE_URL_SANDBOX
      : this.AUTHORIZE_URL_PRODUCTION;
      
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope,
      state: state
    });

    return `${baseUrl}?${params.toString()}`;
  }
}
