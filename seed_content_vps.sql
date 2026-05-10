-- Seed inicial de Blog Posts e Case Studies
-- Idempotente: ON CONFLICT (slug) DO NOTHING
-- Rodar no VPS:  sudo -u postgres psql -d winner_helpdesk -f seed_content_vps.sql

BEGIN;

-- =================== BLOG POSTS ===================
INSERT INTO "BlogPost" (id, slug, title, excerpt, content, category, author, "isPublished", "publishedAt", "createdAt", "updatedAt")
VALUES
('seed_blog_msp', 'como-escolher-um-msp',
 'Como escolher um MSP confiável para sua empresa',
 'Critérios essenciais para avaliar um Managed Service Provider: certificações, SLAs, segurança, processo e cultura.',
 E'Em um cenário em que a TI é cada vez mais crítica para o negócio, escolher um MSP (Managed Service Provider) certo é uma decisão estratégica.\n\nNeste artigo apresentamos os principais critérios que você deve avaliar:\n\n- Certificações técnicas (Microsoft, AWS, Bitdefender, etc.)\n- SLAs claros e mensuráveis\n- Processos de segurança e compliance\n- Cultura de melhoria contínua\n- Capacidade de atender picos de demanda',
 'Gestão de TI', 'Equipe Winner Tecnologia', TRUE,
 '2026-04-15 00:00:00', NOW(), NOW()),

('seed_blog_cyber', 'tendencias-ciberseguranca-2026',
 'Tendências de Cibersegurança para 2026',
 'IA generativa, ataques à cadeia de suprimentos, identidade como perímetro e o avanço do Zero Trust.',
 E'2026 marca uma virada na forma como pensamos segurança corporativa.\n\nIA generativa, supply chain, identidade e Zero Trust estão no centro das estratégias de defesa.\n\nNeste artigo, exploramos cada tendência e como sua empresa pode se preparar.',
 'Cyber Security', 'Equipe Winner Tecnologia', TRUE,
 '2026-03-10 00:00:00', NOW(), NOW()),

('seed_blog_backup', 'backup-321-na-pratica',
 'Estratégia de backup 3-2-1-1-0 na prática',
 'O que significa cada número da regra 3-2-1-1-0 e como implementá-la sem explodir o orçamento.',
 E'A regra 3-2-1-1-0 é considerada o padrão-ouro do backup moderno.\n\n3 cópias dos dados, em 2 mídias diferentes, 1 offsite, 1 imutável e 0 erros nos restores.\n\nNo artigo mostramos como aplicar essa estratégia em pequenas, médias e grandes empresas.',
 'Backup & DR', 'Equipe Winner Tecnologia', TRUE,
 '2026-02-05 00:00:00', NOW(), NOW())
ON CONFLICT (slug) DO NOTHING;

-- =================== CASE STUDIES ===================
INSERT INTO "CaseStudy" (id, slug, theme, title, summary, metrics, "isPublished", "order", "createdAt", "updatedAt")
VALUES
('seed_case_azure', 'migracao-azure-zero-downtime',
 'Indústria',
 'Migração crítica para Azure com zero downtime',
 'Migração de ERP de cliente industrial com múltiplas filiais, mantendo 100% de uptime durante a janela.',
 '[{"label":"Downtime","value":"0min"},{"label":"Redução de TCO","value":"32%"},{"label":"SLA pós-go-live","value":"99,95%"}]'::jsonb,
 TRUE, 1, NOW(), NOW()),

('seed_case_zerotrust', 'zero-trust-lgpd-financeiro',
 'Serviços Financeiros',
 'Implementação de Zero Trust e LGPD',
 'Hardening completo, MFA obrigatório, segregação de redes e adequação LGPD em 90 dias.',
 '[{"label":"Phishing bloqueado","value":"+98%"},{"label":"Compliance LGPD","value":"100%"},{"label":"Tempo de detecção","value":"< 5min"}]'::jsonb,
 TRUE, 2, NOW(), NOW()),

('seed_case_noc', 'monitoramento-247-helpdesk-varejo',
 'Varejo',
 'Monitoramento 24/7 e helpdesk gerenciado',
 'Centralização do atendimento de TI de uma rede de lojas com NOC próprio.',
 '[{"label":"Reabertura de chamados","value":"-65%"},{"label":"Tempo médio de resposta","value":"< 2min"},{"label":"Satisfação do usuário","value":"4,8/5"}]'::jsonb,
 TRUE, 3, NOW(), NOW())
ON CONFLICT (slug) DO NOTHING;

COMMIT;

-- Verificação:
SELECT 'Posts:' AS tipo, COUNT(*) AS total FROM "BlogPost"
UNION ALL
SELECT 'Cases:', COUNT(*) FROM "CaseStudy";
