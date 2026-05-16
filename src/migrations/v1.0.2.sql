-- Migration v1.0.2: Language Support for Email Templates
-- Adds 'language' column to differentiate templates by locale.

-- 1. System Email Templates (Owner Layer)
ALTER TABLE public.system_email_templates ADD COLUMN IF NOT EXISTS language text DEFAULT 'pt';
ALTER TABLE public.system_email_templates DROP CONSTRAINT IF EXISTS system_email_templates_event_type_key;
ALTER TABLE public.system_email_templates DROP CONSTRAINT IF EXISTS system_email_templates_event_type_language_key;
ALTER TABLE public.system_email_templates ADD CONSTRAINT system_email_templates_event_type_language_key UNIQUE (event_type, language);

-- 2. Email Templates (Business/Client Layer)
ALTER TABLE public.email_templates ADD COLUMN IF NOT EXISTS language text DEFAULT 'pt';
ALTER TABLE public.email_templates DROP CONSTRAINT IF EXISTS email_templates_event_type_key;
CREATE UNIQUE INDEX IF NOT EXISTS email_templates_event_type_language_key ON public.email_templates(event_type, language);
