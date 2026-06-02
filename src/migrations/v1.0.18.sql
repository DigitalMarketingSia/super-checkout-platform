-- v1.0.18 - Legal document history by account with auditable snapshots.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.business_legal_document_versions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  document_key TEXT NOT NULL,
  version TEXT NOT NULL,
  published_at TIMESTAMP WITH TIME ZONE NOT NULL,
  source TEXT NOT NULL DEFAULT 'custom',
  template_content TEXT,
  rendered_content TEXT NOT NULL,
  content_sha256 TEXT GENERATED ALWAYS AS (encode(digest(COALESCE(rendered_content, ''), 'sha256'), 'hex')) STORED,
  legal_name TEXT,
  legal_contact TEXT,
  support_email TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

DO $$
BEGIN
  ALTER TABLE public.business_legal_document_versions
    ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE;
  ALTER TABLE public.business_legal_document_versions
    ADD COLUMN IF NOT EXISTS document_key TEXT;
  ALTER TABLE public.business_legal_document_versions
    ADD COLUMN IF NOT EXISTS version TEXT;
  ALTER TABLE public.business_legal_document_versions
    ADD COLUMN IF NOT EXISTS published_at TIMESTAMP WITH TIME ZONE;
  ALTER TABLE public.business_legal_document_versions
    ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'custom';
  ALTER TABLE public.business_legal_document_versions
    ADD COLUMN IF NOT EXISTS template_content TEXT;
  ALTER TABLE public.business_legal_document_versions
    ADD COLUMN IF NOT EXISTS rendered_content TEXT;
  ALTER TABLE public.business_legal_document_versions
    ADD COLUMN IF NOT EXISTS content_sha256 TEXT GENERATED ALWAYS AS (encode(digest(COALESCE(rendered_content, ''), 'sha256'), 'hex')) STORED;
  ALTER TABLE public.business_legal_document_versions
    ADD COLUMN IF NOT EXISTS legal_name TEXT;
  ALTER TABLE public.business_legal_document_versions
    ADD COLUMN IF NOT EXISTS legal_contact TEXT;
  ALTER TABLE public.business_legal_document_versions
    ADD COLUMN IF NOT EXISTS support_email TEXT;
  ALTER TABLE public.business_legal_document_versions
    ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
  ALTER TABLE public.business_legal_document_versions
    ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
  ALTER TABLE public.business_legal_document_versions
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());
  ALTER TABLE public.business_legal_document_versions
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());
END $$;

UPDATE public.business_legal_document_versions
SET document_key = COALESCE(NULLIF(BTRIM(document_key), ''), 'privacy_policy'),
    version = COALESCE(NULLIF(BTRIM(version), ''), CONCAT('legacy-', TO_CHAR(COALESCE(created_at, timezone('utc'::text, now())), 'YYYY.MM.DD.HH24MI'))),
    published_at = COALESCE(published_at, created_at, timezone('utc'::text, now())),
    source = COALESCE(
      NULLIF(BTRIM(source), ''),
      CASE
        WHEN COALESCE(NULLIF(BTRIM(template_content), ''), '') = '' THEN 'default'
        ELSE 'custom'
      END
    ),
    rendered_content = COALESCE(NULLIF(rendered_content, ''), COALESCE(template_content, 'Documento legal indisponivel.')),
    legal_name = COALESCE(NULLIF(BTRIM(legal_name), ''), 'Este vendedor'),
    legal_contact = COALESCE(NULLIF(BTRIM(legal_contact), ''), NULLIF(BTRIM(support_email), ''), 'nao informado'),
    support_email = COALESCE(NULLIF(BTRIM(support_email), ''), 'nao informado'),
    metadata = COALESCE(metadata, '{}'::jsonb),
    created_at = COALESCE(created_at, timezone('utc'::text, now())),
    updated_at = COALESCE(updated_at, timezone('utc'::text, now()))
WHERE COALESCE(NULLIF(BTRIM(document_key), ''), '') = ''
   OR COALESCE(NULLIF(BTRIM(version), ''), '') = ''
   OR published_at IS NULL
   OR COALESCE(NULLIF(BTRIM(source), ''), '') = ''
   OR COALESCE(NULLIF(rendered_content, ''), '') = ''
   OR COALESCE(NULLIF(BTRIM(legal_name), ''), '') = ''
   OR COALESCE(NULLIF(BTRIM(legal_contact), ''), '') = ''
   OR COALESCE(NULLIF(BTRIM(support_email), ''), '') = ''
   OR metadata IS NULL
   OR created_at IS NULL
   OR updated_at IS NULL;

ALTER TABLE public.business_legal_document_versions ALTER COLUMN account_id SET NOT NULL;
ALTER TABLE public.business_legal_document_versions ALTER COLUMN document_key SET NOT NULL;
ALTER TABLE public.business_legal_document_versions ALTER COLUMN version SET NOT NULL;
ALTER TABLE public.business_legal_document_versions ALTER COLUMN published_at SET NOT NULL;
ALTER TABLE public.business_legal_document_versions ALTER COLUMN source SET NOT NULL;
ALTER TABLE public.business_legal_document_versions ALTER COLUMN rendered_content SET NOT NULL;
ALTER TABLE public.business_legal_document_versions ALTER COLUMN metadata SET NOT NULL;
ALTER TABLE public.business_legal_document_versions ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.business_legal_document_versions ALTER COLUMN updated_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'business_legal_document_versions_document_key_check'
  ) THEN
    ALTER TABLE public.business_legal_document_versions
      ADD CONSTRAINT business_legal_document_versions_document_key_check
      CHECK (document_key IN ('privacy_policy', 'terms_of_purchase'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'business_legal_document_versions_source_check'
  ) THEN
    ALTER TABLE public.business_legal_document_versions
      ADD CONSTRAINT business_legal_document_versions_source_check
      CHECK (source IN ('custom', 'default'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_business_legal_document_versions_snapshot
ON public.business_legal_document_versions(account_id, document_key, content_sha256);

CREATE INDEX IF NOT EXISTS idx_business_legal_document_versions_account_published
ON public.business_legal_document_versions(account_id, document_key, published_at DESC, created_at DESC);

WITH default_templates AS (
  SELECT
    $$1. Quem controla os dados
Esta politica explica como {{business_name}} trata dados pessoais em seu checkout, comunicacoes transacionais, suporte e entrega de produtos ou acessos. Para as compras realizadas nesta operacao, o vendedor identificado como {{legal_name}} atua como controlador principal dos dados do comprador. O Super Checkout e outros prestadores tecnicos podem atuar como operadores ou suboperadores para viabilizar a infraestrutura da venda.

2. Quais dados podem ser tratados
Podemos tratar dados de identificacao e contato, como nome e e-mail, e solicitar telefone ou documento apenas quando isso for necessario para contato operacional, prevencao a fraude, conciliacao ou exigencia do metodo de pagamento escolhido; dados da compra, como produto, valor, tentativas, status, meio de pagamento e identificadores da transacao; e dados tecnicos e de seguranca, como IP, user agent, cookies tecnicos, origem de campanha, logs de acesso e eventos necessarios para proteger a operacao.

3. Como os dados sao coletados
Os dados podem ser fornecidos diretamente pelo comprador no checkout, coletados automaticamente pelo navegador ou recebidos de integracoes e processadores usados para pagamento, antifraude, atendimento, entrega e recuperacao de acesso. Quando o vendedor habilita mensuracao comercial, o checkout tambem pode registrar parametros de campanha, identificadores de clique e eventos de navegacao ou compra para atribuicao e performance.

4. Finalidades do tratamento
Os dados sao utilizados para processar o pedido, confirmar o pagamento, entregar o produto, liberar acessos, enviar e-mails transacionais, prestar suporte, prevenir fraude, auditar eventos criticos, cumprir obrigacoes legais e defender direitos em demandas administrativas ou judiciais. Quando o vendedor habilita pixels, analytics ou integracoes de publicidade, dados de navegacao e da transacao tambem podem ser usados para mensuracao comercial, atribuicao de campanhas e deduplicacao de eventos.

5. Compartilhamento com terceiros
Os dados podem ser compartilhados, na medida do necessario, com processadores de pagamento, provedores de hospedagem, banco de dados, envio de e-mail, antifraude, analytics, publicidade e suporte tecnico vinculados a esta operacao. Dados sensiveis de pagamento, como o numero completo do cartao, nao sao armazenados por este checkout e permanecem sob tratamento direto dos processadores utilizados.

6. Retencao e seguranca
Os dados sao mantidos pelo prazo necessario para executar a venda, prestar suporte, cumprir obrigacoes fiscais, regulatorias e de seguranca, ou resguardar direitos em disputas. Logs e trilhas tecnicas sujeitos a janelas operacionais menores podem ser excluidos periodicamente conforme politica interna de retencao. Medidas tecnicas e organizacionais sao adotadas para reduzir acesso indevido, abuso, fraude e exposicao nao autorizada.

7. Direitos do titular e contato
O titular pode solicitar informacoes sobre tratamento, correcao, atualizacao, revogacao de consentimento quando aplicavel e demais direitos previstos em lei pelos canais oficiais do vendedor. Para temas de privacidade e atendimento, o contato informado para esta operacao e {{legal_contact}}. As solicitacoes recebidas podem ser registradas internamente para controle, resposta e evidencia operacional.$$::text AS privacy_template,
    $$1. Identificacao da oferta
Estes termos regulam a compra realizada com {{business_name}} por meio deste checkout. O vendedor identificado como {{legal_name}} e o responsavel comercial pela oferta, pelo conteudo vendido, pela entrega, pelo suporte e pelas informacoes publicadas na pagina de vendas.

2. Condicoes da compra
Antes de concluir o pagamento, o comprador deve verificar descricao da oferta, preco, forma de pagamento, recorrencia quando aplicavel, prazo de acesso, bonus, regras de entrega e eventuais restricoes informadas na oferta. Ao finalizar o pedido, o comprador declara que forneceu dados verdadeiros e possui capacidade legal para contratar.

3. Pagamento e aprovacao
O pagamento pode ser processado por provedores terceiros, como Stripe ou Mercado Pago. A aprovacao depende de validacoes do emissor, do processador e dos mecanismos de antifraude. A simples tentativa de pagamento nao garante aprovacao, reserva definitiva da oferta ou liberacao antecipada de acesso.

4. Entrega e acesso
A liberacao do produto, area de membros, arquivo, link, servico ou instrucoes de uso ocorre conforme a oferta adquirida e depende da confirmacao do pagamento. O comprador deve manter seus dados de contato atualizados para receber e-mails transacionais, acessos e orientacoes pos-compra.

5. Suporte e responsabilidade do comprador
O comprador e responsavel por revisar as informacoes da oferta, utilizar os canais corretos de atendimento e preservar as credenciais recebidas. O compartilhamento indevido de acessos, tentativas de fraude, chargeback abusivo ou uso ilicito do produto podem motivar bloqueio, suspensao ou medidas cabiveis.

6. Cancelamentos, reembolsos e arrependimento
Condicoes especificas de cancelamento, garantia ou reembolso devem ser apresentadas na propria oferta. Quando houver direito de arrependimento ou outra obrigacao legal aplicavel, ela sera observada nos termos da legislacao vigente e pelos canais oficiais do vendedor.

7. Infraestrutura tecnica e contato
O Super Checkout fornece a infraestrutura tecnica do checkout, mas nao substitui as obrigacoes comerciais e legais do vendedor perante o comprador. Quando houver mensuracao comercial habilitada, este checkout pode acionar tecnologias de analytics, pixel e atribuicao para registrar o inicio e a conclusao da compra. Campos como telefone ou documento podem ser exigidos apenas quando o meio de pagamento ou controles antifraude tornarem essa coleta necessaria. Para atendimento comercial, suporte e privacidade desta operacao, o canal informado pelo vendedor e {{support_email}}.$$::text AS terms_template
),
normalized_settings AS (
  SELECT
    bs.account_id,
    COALESCE(NULLIF(BTRIM(bs.business_name), ''), 'Este vendedor') AS business_name,
    COALESCE(NULLIF(BTRIM(bs.legal_name), ''), COALESCE(NULLIF(BTRIM(bs.business_name), ''), 'Este vendedor')) AS legal_name,
    COALESCE(NULLIF(BTRIM(bs.support_email), ''), 'nao informado') AS support_email,
    COALESCE(NULLIF(BTRIM(bs.legal_responsible_email), ''), COALESCE(NULLIF(BTRIM(bs.support_email), ''), 'nao informado')) AS legal_contact,
    COALESCE(NULLIF(BTRIM(bs.support_whatsapp), ''), '') AS support_whatsapp,
    CASE
      WHEN COALESCE(NULLIF(BTRIM(bs.privacy_policy), ''), '') = '' THEN NULL
      ELSE bs.privacy_policy
    END AS privacy_policy_template,
    NULLIF(BTRIM(bs.privacy_policy_version), '') AS privacy_policy_version,
    bs.privacy_policy_published_at,
    CASE
      WHEN COALESCE(NULLIF(BTRIM(bs.terms_of_purchase), ''), '') = '' THEN NULL
      ELSE bs.terms_of_purchase
    END AS terms_template,
    NULLIF(BTRIM(bs.terms_of_purchase_version), '') AS terms_version,
    bs.terms_of_purchase_published_at,
    COALESCE(bs.updated_at, timezone('utc'::text, now())) AS settings_updated_at
  FROM public.business_settings bs
),
privacy_snapshots AS (
  SELECT
    ns.account_id,
    'privacy_policy'::text AS document_key,
    COALESCE(
      ns.privacy_policy_version,
      CASE
        WHEN ns.privacy_policy_template IS NULL THEN 'lgpd-baseline-2026.05'
        ELSE CONCAT('privacy-', TO_CHAR(COALESCE(ns.privacy_policy_published_at, ns.settings_updated_at), 'YYYY.MM.DD'))
      END
    ) AS version,
    COALESCE(
      ns.privacy_policy_published_at,
      CASE
        WHEN ns.privacy_policy_template IS NULL THEN TIMESTAMP WITH TIME ZONE '2026-05-26T00:00:00.000Z'
        ELSE ns.settings_updated_at
      END
    ) AS published_at,
    CASE
      WHEN ns.privacy_policy_template IS NULL THEN 'default'
      ELSE 'custom'
    END AS source,
    COALESCE(ns.privacy_policy_template, dt.privacy_template) AS template_content,
    REPLACE(
      REPLACE(
        REPLACE(
          REPLACE(
            REPLACE(COALESCE(ns.privacy_policy_template, dt.privacy_template), '{{business_name}}', ns.business_name),
            '{{legal_name}}',
            ns.legal_name
          ),
          '{{support_email}}',
          ns.support_email
        ),
        '{{legal_contact}}',
        ns.legal_contact
      ),
      '{{support_whatsapp}}',
      ns.support_whatsapp
    ) AS rendered_content,
    ns.legal_name,
    ns.legal_contact,
    ns.support_email,
    jsonb_build_object(
      'seeded_by_migration', '1.0.18',
      'default_legal_version', 'lgpd-baseline-2026.05',
      'seed_source', 'business_settings'
    ) AS metadata
  FROM normalized_settings ns
  CROSS JOIN default_templates dt
),
terms_snapshots AS (
  SELECT
    ns.account_id,
    'terms_of_purchase'::text AS document_key,
    COALESCE(
      ns.terms_version,
      CASE
        WHEN ns.terms_template IS NULL THEN 'lgpd-baseline-2026.05'
        ELSE CONCAT('terms-', TO_CHAR(COALESCE(ns.terms_of_purchase_published_at, ns.settings_updated_at), 'YYYY.MM.DD'))
      END
    ) AS version,
    COALESCE(
      ns.terms_of_purchase_published_at,
      CASE
        WHEN ns.terms_template IS NULL THEN TIMESTAMP WITH TIME ZONE '2026-05-26T00:00:00.000Z'
        ELSE ns.settings_updated_at
      END
    ) AS published_at,
    CASE
      WHEN ns.terms_template IS NULL THEN 'default'
      ELSE 'custom'
    END AS source,
    COALESCE(ns.terms_template, dt.terms_template) AS template_content,
    REPLACE(
      REPLACE(
        REPLACE(
          REPLACE(
            REPLACE(COALESCE(ns.terms_template, dt.terms_template), '{{business_name}}', ns.business_name),
            '{{legal_name}}',
            ns.legal_name
          ),
          '{{support_email}}',
          ns.support_email
        ),
        '{{legal_contact}}',
        ns.legal_contact
      ),
      '{{support_whatsapp}}',
      ns.support_whatsapp
    ) AS rendered_content,
    ns.legal_name,
    ns.legal_contact,
    ns.support_email,
    jsonb_build_object(
      'seeded_by_migration', '1.0.18',
      'default_legal_version', 'lgpd-baseline-2026.05',
      'seed_source', 'business_settings'
    ) AS metadata
  FROM normalized_settings ns
  CROSS JOIN default_templates dt
)
INSERT INTO public.business_legal_document_versions (
  account_id,
  document_key,
  version,
  published_at,
  source,
  template_content,
  rendered_content,
  legal_name,
  legal_contact,
  support_email,
  metadata
)
SELECT
  snapshot.account_id,
  snapshot.document_key,
  snapshot.version,
  snapshot.published_at,
  snapshot.source,
  snapshot.template_content,
  snapshot.rendered_content,
  snapshot.legal_name,
  snapshot.legal_contact,
  snapshot.support_email,
  snapshot.metadata
FROM (
  SELECT * FROM privacy_snapshots
  UNION ALL
  SELECT * FROM terms_snapshots
) AS snapshot
ON CONFLICT (account_id, document_key, content_sha256) DO NOTHING;

ALTER TABLE public.business_legal_document_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage legal document versions for owned accounts" ON public.business_legal_document_versions;
CREATE POLICY "Users can manage legal document versions for owned accounts"
ON public.business_legal_document_versions
FOR ALL TO authenticated
USING (
  public.is_admin()
  OR EXISTS (
    SELECT 1
    FROM public.accounts a
    WHERE a.id = business_legal_document_versions.account_id
      AND a.owner_user_id = auth.uid()
  )
)
WITH CHECK (
  public.is_admin()
  OR EXISTS (
    SELECT 1
    FROM public.accounts a
    WHERE a.id = business_legal_document_versions.account_id
      AND a.owner_user_id = auth.uid()
  )
);

DROP TRIGGER IF EXISTS update_business_legal_document_versions_updated_at ON public.business_legal_document_versions;
CREATE TRIGGER update_business_legal_document_versions_updated_at
  BEFORE UPDATE ON public.business_legal_document_versions
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

INSERT INTO public.schema_migrations(version, description, success, execution_time_ms)
VALUES ('1.0.18', 'Account-scoped legal document history with auditable snapshots', true, 0)
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
    SET db_version = '1.0.18', updated_at = timezone('utc'::text, now())
    WHERE id = target_id;
  ELSE
    UPDATE public.system_info
    SET db_version = '1.0.18'
    WHERE id = target_id;
  END IF;
END $$;
