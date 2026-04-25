-- ==========================================
-- Migration 015: Security Events Telemetry
-- Data de Criação: 2026-04-15
-- Descrição: Criação da tabela dedicada para log e auditoria de violações de segurança 
-- (Brute force, Rate Limit, Manipulação de Preços).
-- ==========================================

-- 1. Criação da Tabela
CREATE TABLE IF NOT EXISTS public.security_events (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    event_type TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL', 'FATAL')),
    ip_address TEXT,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Índices para Otimização (Consultas de Rate Limit e Filtros por Severidade)
CREATE INDEX IF NOT EXISTS idx_security_events_ip_created 
    ON public.security_events(ip_address, created_at);

CREATE INDEX IF NOT EXISTS idx_security_events_type_severity 
    ON public.security_events(event_type, severity);

-- 3. Habilitação do Row Level Security (RLS)
ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;

-- 4. Políticas de Segurança (Service Role e Admins)

-- Apenas contas com bypass RLS (Service Role) podem inserir logs.
-- Garante que clientes anônimos ou maliciosos não consigam envenenar a auditoria.
DROP POLICY IF EXISTS "Apenas service_role pode inserir na security_events" ON public.security_events;
CREATE POLICY "Apenas service_role pode inserir na security_events"
    ON public.security_events
    FOR INSERT
    TO service_role
    WITH CHECK (true);

-- Blindagem Extra de Grants (Prevenir herança de privilégios)
REVOKE ALL ON public.security_events FROM anon;
REVOKE ALL ON public.security_events FROM authenticated;

-- Apenas administradores autenticados podem ler os eventos.
-- Assume a existência da função is_admin() no schema public.
DROP POLICY IF EXISTS "Administradores podem ler security_events" ON public.security_events;
CREATE POLICY "Administradores podem ler security_events"
    ON public.security_events
    FOR SELECT
    USING (public.is_admin() = true);

-- Comentário da Tabela para Documentação do Schema
COMMENT ON TABLE public.security_events IS 'Tabela isolada para telemetria de ataques, rate-limit e anomalias sistêmicas (Fail-closed system).';
