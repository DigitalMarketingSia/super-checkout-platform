import type { User } from '@supabase/supabase-js';

let cachedAuthUser: User | null = null;

export const getCachedAuthUser = () => cachedAuthUser;

export const setCachedAuthUser = (user: User | null) => {
  cachedAuthUser = user;
};
