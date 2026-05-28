import { supabase } from './supabase';
import type {
  DataRetentionPolicy,
  DataRetentionRun,
  PrivacyDashboardSnapshot,
  PrivacyRequest,
  PrivacyRequestStatus,
  PrivacyRequestType,
} from '../types';

async function getAccessToken() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Sessao expirada. Entre novamente para continuar.');
  }

  return session.access_token;
}

async function request<T>(method: 'GET' | 'POST', payload?: Record<string, any>, query?: string) {
  const token = await getAccessToken();
  const response = await fetch(`/api/admin?action=privacy-ops${query ? `&${query}` : ''}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: method === 'POST' ? JSON.stringify(payload || {}) : undefined,
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok || json?.success === false) {
    throw new Error(json?.error || json?.message || 'Falha na operacao de privacidade.');
  }

  return json.data as T;
}

export const privacyOpsService = {
  async getDashboard(): Promise<PrivacyDashboardSnapshot> {
    return request<PrivacyDashboardSnapshot>('GET');
  },

  async createRequest(input: {
    accountId?: string | null;
    requestType: PrivacyRequestType;
    subjectEmail: string;
    subjectName?: string;
    subjectPhone?: string;
    subjectDocument?: string;
    notes?: string;
  }): Promise<PrivacyRequest> {
    return request<PrivacyRequest>('POST', {
      action: 'create-request',
      ...input,
    });
  },

  async updateRequest(input: {
    id: string;
    status: PrivacyRequestStatus;
    resolutionNotes?: string;
  }): Promise<PrivacyRequest> {
    return request<PrivacyRequest>('POST', {
      action: 'update-request',
      ...input,
    });
  },

  async updatePolicy(input: {
    id: string;
    retentionDays: number;
    active: boolean;
    notes?: string;
  }): Promise<DataRetentionPolicy> {
    return request<DataRetentionPolicy>('POST', {
      action: 'update-policy',
      ...input,
    });
  },

  async runCleanup(tableName?: string): Promise<{ results: DataRetentionRun[] }> {
    return request<{ results: DataRetentionRun[] }>('POST', {
      action: 'run-cleanup',
      tableName: tableName || null,
    });
  },

  async exportSubject(email: string): Promise<Record<string, any>> {
    return request<Record<string, any>>('GET', undefined, `mode=export-subject&email=${encodeURIComponent(email)}`);
  },
};
