-- ==========================================
-- Migration 016: TOTP 2FA
-- Data de Criação: 2026-04-16
-- Descrição: Armazena segredo TOTP criptografado e flag de 2FA para o perfil.
-- ==========================================

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS totp_secret_encrypted TEXT;

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS totp_verified_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN public.profiles.totp_secret_encrypted IS 'Segredo TOTP criptografado para autenticação em duas etapas.';
COMMENT ON COLUMN public.profiles.totp_enabled IS 'Indica se o perfil exige TOTP no login.';
COMMENT ON COLUMN public.profiles.totp_verified_at IS 'Marca a última confirmação válida de TOTP.';
