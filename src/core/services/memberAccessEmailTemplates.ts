export const MEMBER_ACCESS_EMAIL_TEMPLATE_EVENT_TYPES = [
  'MEMBER_INVITATION',
  'MEMBER_MAGIC_LINK',
  'MEMBER_PASSWORD_SETUP',
] as const;

export type MemberAccessEmailTemplateEventType = typeof MEMBER_ACCESS_EMAIL_TEMPLATE_EVENT_TYPES[number];
export type MemberAccessEmailTemplateLanguage = 'pt' | 'en' | 'es';

export interface MemberAccessEmailTemplateDefinition {
  eventType: MemberAccessEmailTemplateEventType;
  name: string;
  purpose: string;
  subject: string;
  htmlBody: string;
  variables: string[];
}

const VARIABLES = ['{{customer_name}}', '{{member_area_name}}', '{{access_url}}', '{{business_name}}'];

const emailFrame = (content: string) => `
  <div style="background:#f3f4f6;padding:28px 12px;font-family:Arial,sans-serif;color:#111827;">
    <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:32px;">
      ${content}
    </div>
  </div>
`;

const COPY: Record<MemberAccessEmailTemplateLanguage, Record<MemberAccessEmailTemplateEventType, {
  name: string;
  purpose: string;
  subject: string;
  title: string;
  greeting: string;
  message: string;
  cta: string;
  signature: string;
}>> = {
  pt: {
    MEMBER_INVITATION: {
      name: 'Convite para Área de Membros',
      purpose: 'Dá boas-vindas a um novo membro e permite criar a primeira senha.',
      subject: 'Bem-vindo! Seu acesso foi liberado',
      title: 'Seu acesso foi liberado',
      greeting: 'Olá, {{customer_name}}.',
      message: 'Você recebeu acesso à área de membros <strong>{{member_area_name}}</strong>. Para começar, crie sua senha pelo botão abaixo.',
      cta: 'Criar senha e acessar',
      signature: 'Equipe {{business_name}}',
    },
    MEMBER_MAGIC_LINK: {
      name: 'Link de Acesso à Área de Membros',
      purpose: 'Envia um acesso seguro para um membro que já possui conta.',
      subject: 'Seu link de acesso está pronto',
      title: 'Acesso liberado',
      greeting: 'Olá, {{customer_name}}.',
      message: 'Seu acesso à área de membros <strong>{{member_area_name}}</strong> foi liberado. Use o botão abaixo para entrar com segurança.',
      cta: 'Entrar na área de membros',
      signature: 'Equipe {{business_name}}',
    },
    MEMBER_PASSWORD_SETUP: {
      name: 'Definição de Senha da Área de Membros',
      purpose: 'Permite que um membro defina ou redefina a senha de acesso.',
      subject: 'Defina sua senha de acesso',
      title: 'Defina sua senha',
      greeting: 'Olá, {{customer_name}}.',
      message: 'Use o botão abaixo para definir uma nova senha e acessar <strong>{{member_area_name}}</strong>.',
      cta: 'Definir senha',
      signature: 'Equipe {{business_name}}',
    },
  },
  en: {
    MEMBER_INVITATION: {
      name: 'Member Area Invitation',
      purpose: 'Welcomes a new member and lets them create their first password.',
      subject: 'Welcome! Your access has been granted',
      title: 'Your access has been granted',
      greeting: 'Hello, {{customer_name}}.',
      message: 'You have access to the <strong>{{member_area_name}}</strong> member area. To get started, create your password using the button below.',
      cta: 'Create password and access',
      signature: '{{business_name}} Team',
    },
    MEMBER_MAGIC_LINK: {
      name: 'Member Area Access Link',
      purpose: 'Sends secure access to a member who already has an account.',
      subject: 'Your access link is ready',
      title: 'Access granted',
      greeting: 'Hello, {{customer_name}}.',
      message: 'Your access to the <strong>{{member_area_name}}</strong> member area has been granted. Use the button below to sign in securely.',
      cta: 'Enter member area',
      signature: '{{business_name}} Team',
    },
    MEMBER_PASSWORD_SETUP: {
      name: 'Member Area Password Setup',
      purpose: 'Lets a member set or reset their access password.',
      subject: 'Set your access password',
      title: 'Set your password',
      greeting: 'Hello, {{customer_name}}.',
      message: 'Use the button below to set a new password and access <strong>{{member_area_name}}</strong>.',
      cta: 'Set password',
      signature: '{{business_name}} Team',
    },
  },
  es: {
    MEMBER_INVITATION: {
      name: 'Invitación al Área de Miembros',
      purpose: 'Da la bienvenida a un nuevo miembro y le permite crear su primera contraseña.',
      subject: '¡Bienvenido! Tu acceso ha sido liberado',
      title: 'Tu acceso ha sido liberado',
      greeting: 'Hola, {{customer_name}}.',
      message: 'Tienes acceso al área de miembros <strong>{{member_area_name}}</strong>. Para comenzar, crea tu contraseña con el botón de abajo.',
      cta: 'Crear contraseña y acceder',
      signature: 'Equipo {{business_name}}',
    },
    MEMBER_MAGIC_LINK: {
      name: 'Enlace de Acceso al Área de Miembros',
      purpose: 'Envía acceso seguro a un miembro que ya tiene una cuenta.',
      subject: 'Tu enlace de acceso está listo',
      title: 'Acceso liberado',
      greeting: 'Hola, {{customer_name}}.',
      message: 'Tu acceso al área de miembros <strong>{{member_area_name}}</strong> ha sido liberado. Usa el botón de abajo para entrar de forma segura.',
      cta: 'Entrar al área de miembros',
      signature: 'Equipo {{business_name}}',
    },
    MEMBER_PASSWORD_SETUP: {
      name: 'Configuración de Contraseña del Área de Miembros',
      purpose: 'Permite a un miembro crear o restablecer su contraseña de acceso.',
      subject: 'Define tu contraseña de acceso',
      title: 'Define tu contraseña',
      greeting: 'Hola, {{customer_name}}.',
      message: 'Usa el botón de abajo para definir una nueva contraseña y acceder a <strong>{{member_area_name}}</strong>.',
      cta: 'Definir contraseña',
      signature: 'Equipo {{business_name}}',
    },
  },
};

export function normalizeMemberAccessEmailLanguage(value?: string | null): MemberAccessEmailTemplateLanguage {
  const language = String(value || '').trim().toLowerCase();
  if (language.startsWith('en')) return 'en';
  if (language.startsWith('es')) return 'es';
  return 'pt';
}

export function getMemberAccessEmailTemplates(
  language: string = 'pt',
): MemberAccessEmailTemplateDefinition[] {
  const resolvedLanguage = normalizeMemberAccessEmailLanguage(language);
  const copy = COPY[resolvedLanguage];

  return MEMBER_ACCESS_EMAIL_TEMPLATE_EVENT_TYPES.map((eventType) => {
    const template = copy[eventType];
    return {
      eventType,
      name: template.name,
      purpose: template.purpose,
      subject: template.subject,
      variables: [...VARIABLES],
      htmlBody: emailFrame(`
        <h1 style="font-size:24px;line-height:1.25;margin:0 0 16px;">${template.title}</h1>
        <p style="margin:0 0 12px;color:#374151;">${template.greeting}</p>
        <p style="margin:0 0 24px;color:#374151;">${template.message}</p>
        <p style="margin:0 0 28px;"><a href="{{access_url}}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:8px;">${template.cta}</a></p>
        <p style="margin:0;color:#6b7280;font-size:13px;">${template.signature}</p>
      `),
    };
  });
}

export function getMemberAccessEmailTemplate(
  eventType: MemberAccessEmailTemplateEventType,
  language: string = 'pt',
) {
  return getMemberAccessEmailTemplates(language).find((template) => template.eventType === eventType) || null;
}
