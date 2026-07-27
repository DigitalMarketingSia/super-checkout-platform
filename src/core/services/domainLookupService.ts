import type { Checkout, Domain, MemberArea } from '../types';
import { isPublicViewUnavailable } from './publicDataViews';
import { publicSupabase } from './supabase';

const buildHostnameVariations = (hostname: string) => ([
  hostname,
  `https://${hostname}`,
  `http://${hostname}`,
  hostname.replace('www.', ''),
  `www.${hostname}`,
]);

class DomainLookupService {
  async getCheckoutByDomainAndSlug(domainId: string, slug?: string): Promise<Checkout | null> {
    let query = publicSupabase
      .from('checkouts')
      .select('*')
      .eq('domain_id', domainId)
      .eq('active', true);

    if (slug) {
      query = query.eq('custom_url_slug', slug);
    }

    const { data, error } = await query.limit(1).maybeSingle();

    if (error) {
      console.error('Error fetching checkout by domain/slug:', error.message);
      return null;
    }

    return data as Checkout;
  }

  async getMemberAreaByDomain(domainId: string): Promise<MemberArea | null> {
    let { data, error } = await publicSupabase
      .from('public_member_areas')
      .select('*')
      .eq('domain_id', domainId)
      .single();

    if (isPublicViewUnavailable(error)) {
      ({ data, error } = await publicSupabase
        .from('member_areas')
        .select('*')
        .eq('domain_id', domainId)
        .single());
    }

    if (error) {
      if (error.code !== 'PGRST116') {
        console.error('Error fetching member area by domain:', error.message);
      }
      return null;
    }

    return data as MemberArea;
  }

  async getDomainByHostname(hostname: string): Promise<Domain | null> {
    let { data, error } = await publicSupabase
      .from('public_domains')
      .select('*')
      .in('domain', buildHostnameVariations(hostname))
      .maybeSingle();

    if (isPublicViewUnavailable(error)) {
      ({ data, error } = await publicSupabase
        .from('domains')
        .select('*')
        .in('domain', buildHostnameVariations(hostname))
        .maybeSingle());
    }

    if (error) {
      if (error.code !== 'PGRST116') {
        console.error('Error fetching domain by hostname:', error.message);
      }
      return null;
    }

    return data as Domain;
  }
}

export const domainLookupService = new DomainLookupService();
