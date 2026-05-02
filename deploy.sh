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

# Fix: schema.prisma pode ter output absoluto do Abacus AI
# Remover para usar default (node_modules/.prisma/client relativo)
if grep -q '/home/ubuntu/winner_tecnologia_site' prisma/schema.prisma 2>/dev/null; then
  echo "[Deploy] Corrigindo output do Prisma..."
  sed -i '/output.*winner_tecnologia_site/d' prisma/schema.prisma
fi

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

# Garantir que NEXT_OUTPUT_MODE e NEXT_DIST_DIR NÃO estejam setados
# (são variáveis do Abacus AI que não devem existir no VPS)
unset NEXT_OUTPUT_MODE
unset NEXT_DIST_DIR

echo "[Deploy] Executando build..."
yarn build

echo "[Deploy] Reiniciando aplicação..."
if command -v pm2 &> /dev/null; then
  echo "[Deploy] Processos PM2 antes:"
  pm2 list
  
  # Criar ecosystem file com node diretamente (evita yarn wrapper)
  cat > "$APP_DIR/ecosystem.config.js" << 'ECOEOF'
module.exports = {
  apps: [{
    name: 'winner-helpdesk',
    script: 'node_modules/.bin/next',
    args: 'start -p 3000',
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

  # Health check - verificar se o app responde
  echo "[Deploy] Aguardando app iniciar..."
  sleep 5
  for i in 1 2 3 4 5; do
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 http://localhost:3000/login 2>/dev/null || echo "000")
    if [ "$HTTP_CODE" != "000" ] && [ "$HTTP_CODE" != "502" ]; then
      echo "[Deploy] ✅ App respondendo (HTTP $HTTP_CODE)"
      break
    fi
    echo "[Deploy] Tentativa $i - aguardando... (HTTP $HTTP_CODE)"
    sleep 3
  done

  # Verificar se PM2 ainda está rodando
  pm2 status winner-helpdesk 2>/dev/null | grep -q "online" && echo "[Deploy] ✅ PM2 online" || echo "[Deploy] ⚠️ PM2 não está online!"
else
  echo "[Deploy] PM2 não encontrado. Tentando systemctl..."
  sudo systemctl restart helpdesk 2>/dev/null || echo "[Deploy] AVISO: Não foi possível reiniciar."
fi

echo "[Deploy] === DEPLOY CONCLUÍDO ==="
