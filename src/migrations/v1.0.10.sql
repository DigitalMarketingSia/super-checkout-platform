-- v1.0.10 - Post-purchase business email templates.
-- Separates purchase confirmation from direct delivery and member-area access.

INSERT INTO public.email_templates (event_type, language, name, subject, html_body, active)
VALUES
(
  'ORDER_DIRECT_DELIVERY',
  'pt',
  'Entrega Direta',
  'Seus materiais estao disponiveis',
  $html$
  <div style="background:#f3f4f6;padding:28px 12px;font-family:Arial,sans-serif;color:#111827;">
    <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:32px;">
      <h1 style="font-size:24px;line-height:1.25;margin:0 0 16px;">Seus materiais estao disponiveis</h1>
      <p style="margin:0 0 12px;color:#374151;">Ola, {{customer_name}}.</p>
      <p style="margin:0 0 20px;color:#374151;">A compra do pedido <strong>{{order_id}}</strong> foi aprovada. Acesse seus materiais abaixo.</p>
      {{deliverables_html}}
      <p style="margin:28px 0 0;color:#6b7280;font-size:13px;">Atenciosamente,<br/>Equipe {{business_name}}</p>
    </div>
  </div>
  $html$,
  true
),
(
  'ORDER_MEMBER_ACCESS',
  'pt',
  'Acesso a Area de Membros',
  'Seu acesso foi liberado',
  $html$
  <div style="background:#f3f4f6;padding:28px 12px;font-family:Arial,sans-serif;color:#111827;">
    <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:32px;">
      <h1 style="font-size:24px;line-height:1.25;margin:0 0 16px;">Seu acesso foi liberado</h1>
      <p style="margin:0 0 12px;color:#374151;">Ola, {{customer_name}}.</p>
      <p style="margin:0 0 20px;color:#374151;">A compra do pedido <strong>{{order_id}}</strong> foi aprovada. Entre na area liberada abaixo.</p>
      {{deliverables_html}}
      <p style="margin:28px 0 0;color:#6b7280;font-size:13px;">Atenciosamente,<br/>Equipe {{business_name}}</p>
    </div>
  </div>
  $html$,
  true
)
ON CONFLICT (event_type, language) DO NOTHING;

UPDATE public.email_templates
SET subject = 'Seu pedido {{order_id}} foi aprovado',
    html_body = $html$
  <div style="background:#f3f4f6;padding:28px 12px;font-family:Arial,sans-serif;color:#111827;">
    <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:32px;">
      <h1 style="font-size:24px;line-height:1.25;margin:0 0 16px;">Compra aprovada</h1>
      <p style="margin:0 0 12px;color:#374151;">Ola, {{customer_name}}.</p>
      <p style="margin:0 0 12px;color:#374151;">Seu pagamento foi confirmado e o pedido <strong>{{order_id}}</strong> esta aprovado.</p>
      <p style="margin:0 0 20px;color:#374151;">Itens da compra: <strong>{{product_names}}</strong>.</p>
      <p style="margin:0;color:#6b7280;font-size:13px;">Atenciosamente,<br/>Equipe {{business_name}}</p>
    </div>
  </div>
  $html$,
    updated_at = timezone('utc'::text, now())
WHERE event_type = 'ORDER_COMPLETED'
  AND language = 'pt'
  AND name = 'Pedido Aprovado'
  AND html_body LIKE '%{{members_area_url}}%';

NOTIFY pgrst, 'reload schema';

INSERT INTO public.schema_migrations(version, description, success, execution_time_ms)
VALUES ('1.0.10', 'Post-purchase business email templates', true, 0)
ON CONFLICT (version) DO UPDATE SET
  description = EXCLUDED.description,
  success = EXCLUDED.success,
  execution_time_ms = EXCLUDED.execution_time_ms,
  executed_at = timezone('utc'::text, now()),
  error_log = NULL;

DO $$
DECLARE
  target_id UUID;
BEGIN
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
    SET db_version = '1.0.10', updated_at = timezone('utc'::text, now())
    WHERE id = target_id;
  ELSE
    UPDATE public.system_info
    SET db_version = '1.0.10'
    WHERE id = target_id;
  END IF;
END $$;
