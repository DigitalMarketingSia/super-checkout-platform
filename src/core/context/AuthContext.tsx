
import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase, CLIENT_INSTANCE_ID } from '../services/supabase';
import { memberService } from '../services/memberService';
import { storage } from '../services/storageService';
import { isSessionTooOld, getSessionPolicyLabel } from '../services/sessionSecurity';
import { Session, User } from '@supabase/supabase-js';
import { Loading } from '../components/ui/Loading';

interface AccountStatus {
  id: string;
  plan_type: string;
  trust_score: number;
}

interface BusinessCompliance {
  status: 'pending' | 'verified' | 'suspended';
  is_ready: boolean;
  name?: string;
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  profile: any | null;
  account: AccountStatus | null;
  compliance: BusinessCompliance | null;
  signOut: () => Promise<void>;
  instanceId: string;
  fetchProfile: (userId: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
  isWhiteLabel: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const maskEmail = (email?: string | null) => {
  const [name, domain] = String(email || '').split('@');
  if (!name || !domain) return 'unknown';
  return `${name.slice(0, 2)}***@${domain}`;
};

interface SessionAuthz {
  role?: string | null;
  is_master_admin?: boolean;
}

const normalizeRole = (role?: string | null) => String(role || '').trim().toLowerCase();

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [account, setAccount] = useState<AccountStatus | null>(null);
  const [compliance, setCompliance] = useState<BusinessCompliance | null>(null);
  const [loading, setLoading] = useState(true);

  const resolveSessionAuthz = async (token?: string | null): Promise<SessionAuthz | null> => {
    try {
      const accessToken = token || (await supabase.auth.getSession()).data.session?.access_token;
      if (!accessToken) return null;

      const response = await fetch('/api/admin/session-authz', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        console.warn('[AuthProvider] Session authz unavailable:', response.status);
        return null;
      }

      return await response.json();
    } catch (error) {
      console.warn('[AuthProvider] Failed to resolve session authz:', error);
    }

    return null;
  };

  const applySessionAuthzToProfile = (
    profileData: any | null,
    authz: SessionAuthz | null,
    authUser?: User | null,
    userId?: string,
  ) => {
    const authzRole = normalizeRole(authz?.role);
    const isMasterAdmin = authz?.is_master_admin || authzRole === 'master_admin';

    if (isMasterAdmin) {
      return {
        ...(profileData || {}),
        id: profileData?.id || authUser?.id || userId,
        email: profileData?.email || authUser?.email || '',
        full_name: profileData?.full_name || authUser?.user_metadata?.full_name || authUser?.email || 'Master Admin',
        role: 'master_admin',
        effective_role: 'master_admin',
        status: profileData?.status || 'active',
      };
    }

    if (profileData && authzRole) {
      return { ...profileData, effective_role: authzRole };
    }

    return profileData;
  };

  const fetchProfile = async (userId: string) => {
    console.log('[AuthProvider] fetchProfile start:', userId);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const authUser = sessionData.session?.user ?? null;
      const authzPromise = sessionData.session?.access_token
        ? resolveSessionAuthz(sessionData.session.access_token)
        : Promise.resolve(null);

      // 1. Fetch Profile
      const profilePromise = supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      const [{ data: profileData, error: profileError }, authz] = await Promise.all([profilePromise, authzPromise]);
      const effectiveProfile = applySessionAuthzToProfile(profileData, authz, authUser, userId);

      if (profileError) {
        console.error('Error fetching profile:', profileError);
        setProfile(effectiveProfile);
      } else {
        setProfile(effectiveProfile);
        if (profileData) {
          // Update last_login_at if it's been a while (optional optimization: only once per session)
          const now = new Date();
          // Basic throttle: if last_login_at is older than 1 hour or null
          const lastLogin = profileData.last_login_at ? new Date(profileData.last_login_at) : new Date(0);
          const diffHours = (now.getTime() - lastLogin.getTime()) / (1000 * 60 * 60);

          if (diffHours > 1) {
            supabase.from('profiles').update({ last_login_at: new Date().toISOString() }).eq('id', userId).then(({ error }) => {
              if (error) console.error("Failed to update last_login_at", error);
            });
          }

          memberService.updateLastSeen(userId).catch(console.error);
        }
      }

      // 2. Fetch Account & Compliance (Parallel via Promise.all or Sequential?)
      // We need Account to get Business Settings
      const { data: accountData } = await supabase
        .from('accounts')
        .select('id, plan_type, trust_score')
        .eq('owner_user_id', userId)
        .single();

      if (accountData) {
        setAccount(accountData);

        const { data: settingsData } = await supabase
          .from('business_settings')
          .select('compliance_status, is_ready_to_sell, business_name')
          .eq('account_id', accountData.id)
          .single();

        if (settingsData) {
          setCompliance({
            status: settingsData.compliance_status,
            is_ready: settingsData.is_ready_to_sell,
            name: settingsData.business_name
          });
        } else {
          // Account exists but settings missing -> Pending
          setCompliance({ status: 'pending', is_ready: false });
        }
      } else {
        // No account -> Effectively Pending (needs creation)
        setAccount(null);
        setCompliance({ status: 'pending', is_ready: false });
      }

    } catch (e) {
      console.error('Exception fetching profile/account:', e);
      setProfile(null);
    } finally {
      console.log('[AuthProvider] fetchProfile end');
    }
  };

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id);
  };

  useEffect(() => {
    let disposed = false;

    const clearAuthState = () => {
      setSession(null);
      setUser(null);
      storage.setUser(null);
      setProfile(null);
      setAccount(null);
      setCompliance(null);
    };

    // Get initial session
    const bootstrap = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (disposed) return;

      console.log('[AuthProvider] Initial session check:', maskEmail(session?.user?.email));
      if (session && isSessionTooOld(session)) {
        console.warn(`[AuthProvider] Session expired by policy (${getSessionPolicyLabel()}):`, maskEmail(session.user?.email));
        try {
          await supabase.auth.signOut();
        } catch (error) {
          console.warn('[AuthProvider] Failed to sign out expired session:', error);
        }

        clearAuthState();
        setLoading(false);
        return;
      }

      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        storage.setUser(session.user);
        console.log('[AuthProvider] Fetching initial profile...');
        fetchProfile(session.user.id)
          .then(() => console.log('[AuthProvider] Initial profile fetch success'))
          .catch(e => console.error('[AuthProvider] Initial profile fetch error', e))
          .finally(() => setLoading(false));
      } else {
        console.log('[AuthProvider] No session, loading complete.');
        setLoading(false);
      }
    };

    bootstrap();

    // Listen for changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (disposed) return;

      console.log('[AuthProvider] Auth state change:', _event, maskEmail(session?.user?.email));
      if (session && isSessionTooOld(session)) {
        console.warn(`[AuthProvider] Rejecting stale auth session (${getSessionPolicyLabel()}):`, maskEmail(session.user?.email));
        supabase.auth.signOut().catch((error) => {
          console.warn('[AuthProvider] signOut after stale session failed:', error);
        });
        clearAuthState();
        return;
      }

      setSession(session);
      setUser(session?.user ?? null);
      storage.setUser(session?.user ?? null);

      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setProfile(null);
        setAccount(null);
        setCompliance(null);
      }
    });

    return () => {
      disposed = true;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setAccount(null);
    setCompliance(null);
  };

  if (loading) {
    return <Loading />;
  }

  const isWhiteLabel = import.meta.env.VITE_SYSTEM_MODE === 'WHITELABEL';

  return (
    <AuthContext.Provider value={{ session, user, profile, account, compliance, signOut, loading, instanceId: CLIENT_INSTANCE_ID, fetchProfile, refreshProfile, isWhiteLabel }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
