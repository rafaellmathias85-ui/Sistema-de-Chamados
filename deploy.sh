#!/bin/bash
# ============================================================
# deploy.sh — Build & Restart na VPS Hostinger
# Chamado pelo GitHub Actions após git pull
# v3 — Correções definitivas para VPS
# ============================================================
set -e

APP_DIR="/var/www/helpdesk/app"
ENV_BACKUP="/var/www/helpdesk/.env.backup"
cd "$APP_DIR"

echo "[Deploy] === INICIANDO DEPLOY ==="
echo "[Deploy] Diretório: $(pwd)"
echo "[Deploy] Node: $(node -v 2>/dev/null || echo 'NÃO ENCONTRADO')"
echo "[Deploy] Yarn: $(yarn -v 2>/dev/null || echo 'NÃO ENCONTRADO')"
echo "[Deploy] NPM: $(npm -v 2>/dev/null || echo 'NÃO ENCONTRADO')"

# ============================================================
# 1. RESTAURAR .env
# ============================================================
if [ ! -f ".env" ] && [ -f "$ENV_BACKUP" ]; then
  echo "[Deploy] Restaurando .env do backup..."
  cp "$ENV_BACKUP" .env
fi

if [ ! -f ".env" ]; then
  echo "[Deploy] AVISO: .env não encontrado!"
  echo "[Deploy] ATENÇÃO: Edite /var/www/helpdesk/app/.env com as credenciais corretas!"
fi

if [ -f ".env" ]; then
  cp .env "$ENV_BACKUP"
fi

# ============================================================
# 2. CORREÇÕES ABACUS AI → VPS
# ============================================================

# 2a. Remover output absoluto do Prisma (caminho do Abacus)
if grep -q '/home/ubuntu/winner_tecnologia_site' prisma/schema.prisma 2>/dev/null; then
  echo "[Deploy] Corrigindo output do Prisma..."
  sed -i '/output.*winner_tecnologia_site/d' prisma/schema.prisma
fi

# 2b. Remover variáveis Abacus do .env
if [ -f ".env" ]; then
  sed -i '/^NEXT_OUTPUT_MODE=/d' .env
  sed -i '/^NEXT_DIST_DIR=/d' .env
  echo "[Deploy] Variáveis Abacus removidas do .env"
fi

# 2c. Remover outputFileTracingRoot do next.config.js
if grep -q 'outputFileTracingRoot' next.config.js 2>/dev/null; then
  echo "[Deploy] Removendo outputFileTracingRoot do next.config.js..."
  sed -i '/outputFileTracingRoot/d' next.config.js
fi

# 2d. Remover experimental vazio do next.config.js
if grep -q 'experimental.*{' next.config.js 2>/dev/null; then
  # Verificar se o bloco experimental está vazio (só tem {})
  python3 -c "
import re
with open('next.config.js','r') as f: c = f.read()
c = re.sub(r'experimental\s*:\s*\{\s*\},?\s*\n?', '', c)
with open('next.config.js','w') as f: f.write(c)
" 2>/dev/null || true
fi

# 2e. Corrigir .yarnrc.yml — remover caminhos do Abacus
#     O Abacus usa /opt/hostedapp/ que não existe na VPS
if [ -f ".yarnrc.yml" ]; then
  if grep -q '/opt/hostedapp' .yarnrc.yml 2>/dev/null; then
    echo "[Deploy] Corrigindo .yarnrc.yml (removendo caminhos Abacus)..."
    cat > .yarnrc.yml << 'YARNEOF'
nodeLinker: node-modules
YARNEOF
  fi
fi

# 2f. Garantir que variáveis não existam no shell
unset NEXT_OUTPUT_MODE
unset NEXT_DIST_DIR

# ============================================================
# 3. INSTALAR DEPENDÊNCIAS & BUILD
# ============================================================

echo "[Deploy] Instalando dependências..."
yarn install --frozen-lockfile 2>/dev/null || yarn install

echo "[Deploy] Gerando Prisma Client..."
yarn prisma generate

echo "[Deploy] Aplicando schema ao banco..."
yarn prisma db push --skip-generate 2>/dev/null || true
npx tsx scripts/seed.ts 2>/dev/null || echo "[Deploy] AVISO: Seed falhou (não-crítico)"

# Limpar build anterior
echo "[Deploy] Limpando build anterior..."
rm -rf .next

echo "[Deploy] Executando build..."
yarn build

# Verificar se o build gerou o diretório .next corretamente
if [ ! -f ".next/BUILD_ID" ]; then
  echo "[Deploy] ERRO FATAL: Build não gerou .next/BUILD_ID!"
  ls -la .next/ 2>/dev/null || echo ".next/ não existe!"
  exit 1
fi

echo "[Deploy] ✅ Build concluído. BUILD_ID: $(cat .next/BUILD_ID)"

# ============================================================
# 4. REINICIAR PM2
# ============================================================

echo "[Deploy] Reiniciando aplicação..."
if command -v pm2 &> /dev/null; then
  echo "[Deploy] Processos PM2 antes:"
  pm2 list

  # Encontrar o binário next de forma robusta
  NEXT_BIN=""
  for candidate in \
    "$(pwd)/node_modules/.bin/next" \
    "$(pwd)/node_modules/next/dist/bin/next" \
    "$(which next 2>/dev/null)"; do
    if [ -e "$candidate" ]; then
      NEXT_BIN="$candidate"
      break
    fi
  done

  # Fallback final: usar node com require
  if [ -z "$NEXT_BIN" ]; then
    echo "[Deploy] ⚠️ Next binary não encontrado! Usando node -e require approach"
    NEXT_BIN="node"
    NEXT_ARGS="-e \"require('next/dist/bin/next')\" start -p 3000"
  else
    echo "[Deploy] Next binary: $NEXT_BIN"
    NEXT_ARGS="start -p 3000"
  fi

  echo "[Deploy] Binário: $NEXT_BIN"
  echo "[Deploy] Args: $NEXT_ARGS"

  # Criar ecosystem usando node como interpretador (mais robusto com PM2)
  NODE_BIN="$(which node)"
  NEXT_CLI="$(pwd)/node_modules/next/dist/bin/next"
  
  cat > "$APP_DIR/ecosystem.config.js" << ECOEOF
module.exports = {
  apps: [{
    name: 'winner-helpdesk',
    script: '${NODE_BIN}',
    args: '${NEXT_CLI} start -p 3000',
    cwd: '${APP_DIR}',
    exec_mode: 'fork',
    instances: 1,
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
    max_memory_restart: '512M',
    env: {
      NODE_ENV: 'production',
      PORT: '3000',
      PATH: '${APP_DIR}/node_modules/.bin:/usr/local/bin:/usr/bin:/bin'
    }
  }]
};
ECOEOF

  echo "[Deploy] ecosystem.config.js:"
  cat "$APP_DIR/ecosystem.config.js"

  # Limpar processos antigos
  pm2 delete helpdesk 2>/dev/null || true
  pm2 delete winner-helpdesk 2>/dev/null || true

  # Iniciar com RUNNER_TRACKING_ID vazio para evitar orphan cleanup
  RUNNER_TRACKING_ID="" pm2 start "$APP_DIR/ecosystem.config.js"
  sleep 5
  RUNNER_TRACKING_ID="" pm2 save --force

  echo "[Deploy] Processos PM2 após restart:"
  pm2 list

  # ============================================================
  # 5. HEALTH CHECK
  # ============================================================
  echo "[Deploy] Aguardando app iniciar..."
  sleep 5
  SUCCESS=false
  for i in 1 2 3 4 5 6 7 8; do
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 http://localhost:3000/login 2>/dev/null || echo "000")
    if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "302" ] || [ "$HTTP_CODE" = "307" ]; then
      echo "[Deploy] ✅ App respondendo corretamente (HTTP $HTTP_CODE)"
      SUCCESS=true
      break
    elif [ "$HTTP_CODE" = "404" ]; then
      echo "[Deploy] ⚠️ Tentativa $i - HTTP 404"
    else
      echo "[Deploy] Tentativa $i - HTTP $HTTP_CODE"
    fi
    sleep 3
  done

  if [ "$SUCCESS" = false ]; then
    echo "[Deploy] ⚠️ App não respondeu com sucesso. Logs PM2:"
    pm2 logs winner-helpdesk --nostream --lines 30 2>/dev/null || true
  fi

  # Verificar status PM2 final
  pm2 status winner-helpdesk 2>/dev/null | grep -q "online" && echo "[Deploy] ✅ PM2 online" || echo "[Deploy] ⚠️ PM2 não está online!"
else
  echo "[Deploy] PM2 não encontrado. Tentando systemctl..."
  sudo systemctl restart helpdesk 2>/dev/null || echo "[Deploy] AVISO: Não foi possível reiniciar."
fi

echo "[Deploy] === DEPLOY CONCLUÍDO ==="
