import { storage, supabase } from './storageService';
import { Order } from '../types';
import { getActivationSetupUrl, getActivationUrl } from '../config/platformUrls';

interface EmailData {
    to: string;
    subject: string;
    html: string;
    from_name?: string;
    flow: 'ORDER_COMPLETED' | 'ACCESS_GRANTED' | 'BOLETO_GENERATED' | 'SYSTEM_EMAIL' | 'INTEGRATION_TEST';
}

class EmailService {
    private async getSenderIdentity(): Promise<string | undefined> {
        try {
            const { data: settings } = await supabase
                .from('business_settings')
                .select('sender_name, business_name')
                .maybeSingle();

            if (settings) {
                return settings.sender_name || settings.business_name;
            }
        } catch (e) {
            console.warn('[EmailService] Failed to fetch sender identity:', e);
        }
        return undefined;
    }

    private async sendEmail(data: EmailData): Promise<boolean> {
        try {
            if (!data.from_name) {
                data.from_name = await this.getSenderIdentity();
            }

            const { data: sessionData } = await supabase.auth.getSession();
            const accessToken = sessionData.session?.access_token;

            const response = await fetch('/api/send-email', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
                },
                body: JSON.stringify(data)
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error('[EmailService] Error sending email:', errorData);
                return false;
            }

            return true;
        } catch (error) {
            console.error('[EmailService] Network error:', error);
            return false;
        }
    }

    private getLang(): string {
        const currentLang = localStorage.getItem('i18nextLng') || 'pt';
        return currentLang.split('-')[0];
    }

    private getAppOrigin(): string {
        if (typeof window !== 'undefined' && window.location?.origin) {
            return window.location.origin.replace(/\/+$/, '');
        }
        return 'https://app.supercheckout.app';
    }

    private async resolveMembersAreaUrl(order: Order): Promise<string> {
        const origin = this.getAppOrigin();
        const productIds = Array.from(new Set((order.items || [])
            .map((item: any) => item.product_id || item.id)
            .filter(Boolean)));

        if (productIds.length === 0) return `${origin}/login`;

        try {
            const { data: products } = await supabase
                .from('products')
                .select('id, member_area_id')
                .in('id', productIds);

            const directAreaId = (products || []).find((product: any) => product.member_area_id)?.member_area_id;
            if (directAreaId) {
                const directUrl = await this.resolveMemberAreaUrlById(directAreaId, origin);
                if (directUrl) return directUrl;
            }
        } catch (error) {
            console.warn('[EmailService] Direct product member area lookup failed:', error);
        }

        try {
            const { data: links } = await supabase
                .from('product_contents')
                .select('content:contents(member_area_id)')
                .in('product_id', productIds)
                .limit(1);

            const linkedAreaId = (links || [])
                .map((link: any) => Array.isArray(link.content) ? link.content[0] : link.content)
                .find((content: any) => content?.member_area_id)?.member_area_id;
            if (linkedAreaId) {
                const linkedUrl = await this.resolveMemberAreaUrlById(linkedAreaId, origin);
                if (linkedUrl) return linkedUrl;
            }
        } catch (error) {
            console.warn('[EmailService] Product content member area lookup failed:', error);
        }

        return `${origin}/login`;
    }

    private async resolveMemberAreaUrlById(memberAreaId: string, origin: string): Promise<string | null> {
        const { data: area, error } = await supabase
            .from('member_areas')
            .select('slug, domains(domain)')
            .eq('id', memberAreaId)
            .maybeSingle();

        if (error || !area) {
            if (error) console.warn('[EmailService] Member area lookup failed:', error);
            return null;
        }

        const customDomain = (area as any).domains?.domain;
        if (customDomain) return `https://${customDomain}`;
        if (area.slug) return `${origin}/app/${area.slug}`;
        return null;
    }

    async sendPaymentApproved(order: Order) {
        const lang = this.getLang();
        
        const { data: template } = await supabase
            .from('email_templates')
            .select('*')
            .eq('event_type', 'ORDER_COMPLETED')
            .eq('language', lang)
            .eq('active', true)
            .maybeSingle();

        const productName = order.items?.[0]?.name || 'seu produto';
        const membersAreaUrl = await this.resolveMembersAreaUrl(order);

        if (template) {
            const variables: Record<string, string> = {
                '{{order_id}}': order.id ? '#' + order.id.split('-')[0] : '',
                '{{customer_name}}': order.customer_name || 'Cliente',
                '{{product_names}}': productName,
                '{{members_area_url}}': membersAreaUrl,
            };

            let subject = template.subject;
            let html = template.html_body;

            for (const [key, value] of Object.entries(variables)) {
                subject = subject.replace(new RegExp(key, 'g'), value);
                html = html.replace(new RegExp(key, 'g'), value);
            }

            return await this.sendEmail({
                to: order.customer_email,
                subject: subject,
                html: html,
                flow: 'ORDER_COMPLETED'
            });
        }

        // Fallback HTML
        const subjects: any = {
            pt: "Pagamento Aprovado - Acesso Liberado!",
            en: "Payment Approved - Access Granted!",
            es: "¡Pago Aprobado - Acceso Liberado!"
        };

        const html = `
<!DOCTYPE html>
<html lang="${lang}">
<body style="margin: 0; padding: 0; background-color: #f6f6f6; font-family: Arial, sans-serif;">
    <center style="width: 100%; padding: 20px;">
        <div style="max-width: 600px; background-color: #ffffff; padding: 40px; border-radius: 8px; text-align: center;">
            <h1 style="color: #1a1a1a;">${lang === 'en' ? 'Hello' : lang === 'es' ? 'Hola' : 'Olá'}, ${order.customer_name}!</h1>
            <p style="color: #555555; font-size: 16px; line-height: 1.5;">
                ${lang === 'en' ? `Your payment for <strong>${productName}</strong> was approved!` : 
                  lang === 'es' ? `¡Tu pago para <strong>${productName}</strong> fue aprobado!` : 
                  `Seu pagamento para <strong>${productName}</strong> foi aprovado!`}
            </p>
            <a href="${membersAreaUrl}" target="_blank" 
               style="background: #007bff; color: #ffffff; padding: 15px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; margin: 20px 0;">
                ${lang === 'en' ? 'ACCESS MEMBERS AREA' : lang === 'es' ? 'ACCEDER ÁREA DE MIEMBROS' : 'ACESSAR ÁREA DE MEMBROS'}
            </a>
            <p style="color: #999999; font-size: 12px; margin-top: 40px;">Super Checkout</p>
        </div>
    </center>
</body>
</html>`;

        return await this.sendEmail({
            to: order.customer_email,
            subject: subjects[lang] || subjects.pt,
            html,
            flow: 'ORDER_COMPLETED'
        });
    }

    async sendAccessEmail(data: { email: string, name: string, membersAreaUrl?: string }) {
        const lang = this.getLang();

        const { data: template } = await supabase
            .from('email_templates')
            .select('*')
            .eq('event_type', 'ACCESS_GRANTED')
            .eq('language', lang)
            .eq('active', true)
            .maybeSingle();

        const membersAreaUrl = data.membersAreaUrl || 'https://app.supercheckout.com/login';

        if (template) {
            const variables: Record<string, string> = {
                '{{name}}': data.name || 'Cliente',
                '{{email}}': data.email,
                '{{members_area_url}}': membersAreaUrl,
            };

            let subject = template.subject;
            let html = template.html_body;

            for (const [key, value] of Object.entries(variables)) {
                subject = subject.replace(new RegExp(key, 'g'), value);
                html = html.replace(new RegExp(key, 'g'), value);
            }

            return await this.sendEmail({
                to: data.email,
                subject: subject,
                html: html,
                flow: 'ACCESS_GRANTED'
            });
        }

        const subjects: any = {
            pt: "Acesso Liberado - Área de Membros",
            en: "Access Granted - Members Area",
            es: "Acceso Liberado - Área de Miembros"
        };

        const html = `<h1>${lang === 'en' ? 'Hello' : lang === 'es' ? 'Hola' : 'Olá'}, ${data.name}!</h1>
                      <p>${lang === 'en' ? 'Your access has been granted. Access at:' : 
                          lang === 'es' ? 'Tu acceso ha sido liberado. Accede en:' : 
                          'Seu acesso foi liberado. Acesse em:'} <a href="${membersAreaUrl}">${membersAreaUrl}</a></p>`;

        return await this.sendEmail({
            to: data.email,
            subject: subjects[lang] || subjects.pt,
            html,
            flow: 'ACCESS_GRANTED'
        });
    }

    async sendBoletoGenerated(order: Order, boletoUrl: string, barcode: string) {
        const lang = this.getLang();
        const productName = order.items?.[0]?.name || 'seu produto';
        
        // Temporarily fallback for boleto as it's very specific to BRL market
        // But we could localized if needed
        return await this.sendEmail({
            to: order.customer_email,
            subject: `Boleto Gerado - ${productName}`,
            flow: 'BOLETO_GENERATED',
            html: `<p>Olá ${order.customer_name}, seu boleto foi gerado.</p><p>Código: ${barcode}</p><a href="${boletoUrl}">Ver Boleto</a>`
        });
    }

    private async sendSystemEmail(eventType: string, to: string, variables: Record<string, string>) {
        try {
            const lang = this.getLang();

            const { data: template } = await supabase
                .from('system_email_templates')
                .select('*')
                .eq('event_type', eventType)
                .eq('language', lang)
                .eq('active', true)
                .maybeSingle();

            if (!template) {
                console.warn(`[EmailService] System template not found or inactive for: ${eventType} [${lang}]`);
                return false;
            }

            let subject = template.subject;
            let html = template.html_body;

            for (const [key, value] of Object.entries(variables)) {
                subject = subject.replace(new RegExp(key, 'g'), value);
                html = html.replace(new RegExp(key, 'g'), value);
            }

            return await this.sendEmail({
                to,
                subject,
                html,
                flow: 'SYSTEM_EMAIL',
                from_name: 'Super Checkout'
            });
        } catch (error) {
            console.error(`[EmailService] Error sending system email ${eventType}:`, error);
            return false;
        }
    }

    async sendWelcomeFree(email: string, name: string) {
        return await this.sendSystemEmail('WELCOME_FREE', email, {
            '{{name}}': name,
            '{{portal_url}}': getActivationUrl()
        });
    }

    async sendUpgradeUnlimited(email: string, name: string) {
        return await this.sendSystemEmail('UPGRADE_UNLIMITED', email, {
            '{{name}}': name,
            '{{support_url}}': 'https://wa.me/55...'
        });
    }

    async sendUpgradePartner(email: string, name: string) {
        return await this.sendSystemEmail('UPGRADE_PARTNER', email, {
            '{{name}}': name,
            '{{partner_portal_url}}': getActivationSetupUrl()
        });
    }
}

export const emailService = new EmailService();
