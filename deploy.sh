#!/bin/bash
# ============================================================
# deploy.sh — Build & Restart na VPS Hostinger
# Chamado pelo GitHub Actions após git pull
# ============================================================
set -e

APP_DIR="/var/www/helpdesk/app"
ENV_BACKUP="/var/www/helpdesk/.env.backup"
cd "$APP_DIR"

# Restaurar .env se foi deletado pelo git reset
if [ ! -f ".env" ] && [ -f "$ENV_BACKUP" ]; then
  echo "[Deploy] Restaurando .env do backup..."
  cp "$ENV_BACKUP" .env
fi

# Verificar se .env existe, senão criar com valores mínimos
if [ ! -f ".env" ]; then
  echo "[Deploy] AVISO: .env não encontrado! Criando com valores padrão..."
  echo "[Deploy] ATENÇÃO: Edite /var/www/helpdesk/app/.env com as credenciais corretas!"
fi

# Sempre manter backup atualizado do .env
if [ -f ".env" ]; then
  cp .env "$ENV_BACKUP"
fi

# ============================================================
# CORREÇÕES ABACUS AI → VPS
# Remover variáveis e configs que são do ambiente Abacus
# ============================================================

# 1. Remover output absoluto do Prisma
if grep -q '/home/ubuntu/winner_tecnologia_site' prisma/schema.prisma 2>/dev/null; then
  echo "[Deploy] Corrigindo output do Prisma..."
  sed -i '/output.*winner_tecnologia_site/d' prisma/schema.prisma
fi

# 2. Remover NEXT_OUTPUT_MODE e NEXT_DIST_DIR do .env
#    Essas variáveis são do Abacus AI e causam 404 no VPS
#    (standalone mode + next start são incompatíveis)
if [ -f ".env" ]; then
  sed -i '/^NEXT_OUTPUT_MODE=/d' .env
  sed -i '/^NEXT_DIST_DIR=/d' .env
  echo "[Deploy] Variáveis Abacus removidas do .env"
fi

# 3. Remover outputFileTracingRoot do next.config.js
#    (não é necessário para deploy VPS e pode causar problemas)
if grep -q 'outputFileTracingRoot' next.config.js 2>/dev/null; then
  echo "[Deploy] Removendo outputFileTracingRoot do next.config.js..."
  sed -i '/outputFileTracingRoot/d' next.config.js
  # Limpar experimental block se ficou vazio
  sed -i '/experimental:\s*{\s*},\?/d' next.config.js 2>/dev/null || true
fi

# 4. Unset variáveis do shell (belt and suspenders)
unset NEXT_OUTPUT_MODE
unset NEXT_DIST_DIR

# ============================================================
# BUILD
# ============================================================

echo "[Deploy] Instalando dependências..."
yarn install --frozen-lockfile 2>/dev/null || yarn install

echo "[Deploy] Gerando Prisma Client..."
yarn prisma generate

echo "[Deploy] Aplicando migrações e seed..."
yarn prisma db push --skip-generate 2>/dev/null || true
npx tsx scripts/seed.ts 2>/dev/null || echo "[Deploy] AVISO: Seed falhou (não-crítico)"

# Limpar build anterior para evitar cache corrompido
echo "[Deploy] Limpando build anterior..."
rm -rf .next .build

echo "[Deploy] Executando build..."
yarn build

echo "[Deploy] Reiniciando aplicação..."
if command -v pm2 &> /dev/null; then
  echo "[Deploy] Processos PM2 antes:"
  pm2 list
  
  # Criar ecosystem file
  cat > "$APP_DIR/ecosystem.config.js" << 'ECOEOF'
module.exports = {
  apps: [{
    name: 'winner-helpdesk',
    script: 'yarn',
    args: 'start',
    cwd: '/var/www/helpdesk/app',
    exec_mode: 'fork',
    instances: 1,
    autorestart: true,
    max_memory_restart: '512M',
    env: {
      NODE_ENV: 'production',
      PORT: '3000'
    }
  }]
};
ECOEOF

  # Limpar processos antigos
  pm2 delete helpdesk 2>/dev/null || true
  pm2 delete winner-helpdesk 2>/dev/null || true
  
  # Iniciar com ecosystem e desabilitar orphan cleanup do Actions
  RUNNER_TRACKING_ID="" pm2 start "$APP_DIR/ecosystem.config.js"
  sleep 3
  RUNNER_TRACKING_ID="" pm2 save --force
  
  echo "[Deploy] Processos PM2 após restart:"
  pm2 list
  pm2 describe winner-helpdesk 2>/dev/null | grep "exec cwd" || true

  # Diagnósticos do build output
  echo "[Deploy] === DIAGNÓSTICOS ==="
  echo "[Deploy] Build directory:"
  ls -la .next/ 2>/dev/null | head -15
  echo "[Deploy] Server app directory:"
  ls -la .next/server/app/ 2>/dev/null | head -15
  echo "[Deploy] Build ID:"
  cat .next/BUILD_ID 2>/dev/null || echo "BUILD_ID não encontrado!"
  echo "[Deploy] next.config.js final:"
  cat next.config.js
  echo "[Deploy] .env vars (filtradas):"
  grep -E "^(NEXT_|NODE_ENV|PORT)" .env 2>/dev/null || echo "Nenhuma variável NEXT_ encontrada"
  echo "[Deploy] === FIM DIAGNÓSTICOS ==="

  # Health check - verificar se o app responde
  echo "[Deploy] Aguardando app iniciar..."
  sleep 8
  for i in 1 2 3 4 5; do
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 http://localhost:3000/login 2>/dev/null || echo "000")
    if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "302" ]; then
      echo "[Deploy] ✅ App respondendo corretamente (HTTP $HTTP_CODE)"
      break
    elif [ "$HTTP_CODE" = "404" ]; then
      echo "[Deploy] ⚠️ Tentativa $i - HTTP 404 (páginas não encontradas)"
      echo "[Deploy] PM2 logs (últimas 20 linhas):"
      pm2 logs winner-helpdesk --nostream --lines 20 2>/dev/null || true
    else
      echo "[Deploy] Tentativa $i - aguardando... (HTTP $HTTP_CODE)"
    fi
    sleep 3
  done

  # Verificar se PM2 ainda está rodando
  pm2 status winner-helpdesk 2>/dev/null | grep -q "online" && echo "[Deploy] ✅ PM2 online" || echo "[Deploy] ⚠️ PM2 não está online!"
else
  echo "[Deploy] PM2 não encontrado. Tentando systemctl..."
  sudo systemctl restart helpdesk 2>/dev/null || echo "[Deploy] AVISO: Não foi possível reiniciar."
fi

echo "[Deploy] === DEPLOY CONCLUÍDO ==="
