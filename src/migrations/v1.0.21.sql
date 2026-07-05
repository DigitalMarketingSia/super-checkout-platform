-- v1.0.21 - Tune retention policies to support anonymization for technical logs.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'data_retention_policies'
  ) THEN
    INSERT INTO public.data_retention_policies(table_name, retention_days, run_mode, active, notes)
    VALUES
      ('webhook_logs', 90, 'anonymize', true, 'Payloads tecnicos de webhook devem ser anonimizados apos a janela operacional, preservando apenas trilha minima.'),
      ('activity_logs', 180, 'delete', true, 'Historico operacional de membros deve ser reavaliado periodicamente.'),
      ('validation_logs', 180, 'anonymize', true, 'Logs de validacao de licenca devem remover identificadores tecnicos apos a janela operacional.'),
      ('two_factor_challenges', 30, 'delete', true, 'Desafios MFA expiram rapidamente e nao exigem retencao longa.'),
      ('security_events', 365, 'anonymize', true, 'Eventos de seguranca podem manter severidade e timeline, mas devem remover IP/usuario/metadados sensiveis apos a janela investigativa.'),
      ('system_updates_log', 365, 'delete', true, 'Trilha operacional de updates deve permanecer por prazo controlado.')
    ON CONFLICT (table_name) DO UPDATE SET
      retention_days = EXCLUDED.retention_days,
      run_mode = EXCLUDED.run_mode,
      active = EXCLUDED.active,
      notes = EXCLUDED.notes,
      updated_at = timezone('utc'::text, now());
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'schema_migrations'
  ) THEN
    INSERT INTO public.schema_migrations(version, description, success, execution_time_ms)
    VALUES ('1.0.21', 'Tune retention policies for anonymization-capable technical logs', true, 0)
    ON CONFLICT (version) DO UPDATE SET
      description = EXCLUDED.description,
      success = EXCLUDED.success,
      execution_time_ms = EXCLUDED.execution_time_ms,
      executed_at = timezone('utc'::text, now()),
      error_log = NULL;
  END IF;
END $$;

DO $$
DECLARE
  target_id UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'system_info'
  ) THEN
    RETURN;
  END IF;

  SELECT id INTO target_id FROM public.system_info LIMIT 1;

  IF target_id IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'system_info'
      AND column_name = 'updated_at'
  ) THEN
    UPDATE public.system_info
    SET db_version = '1.0.21', updated_at = timezone('utc'::text, now())
    WHERE id = target_id;
  ELSE
    UPDATE public.system_info
    SET db_version = '1.0.21'
    WHERE id = target_id;
  END IF;
END $$;
