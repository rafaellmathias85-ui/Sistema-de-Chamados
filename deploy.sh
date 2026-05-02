#!/bin/bash
# ============================================================
# deploy.sh v5 — Build & Restart VPS Hostinger
# Chamado pelo GitHub Actions após git pull
# 
# Mudanças v5:
# - Removido max_memory_restart (causava OOM kill durante startup)
# - Adicionado kill explícito de TODOS os processos na porta 3000
# - Polling loop para garantir porta livre (ss + lsof + fuser)
# - interpreter: 'node' explícito no ecosystem
# - max_restarts: 3 (previne cascade)
# - kill_timeout: 30000 (graceful shutdown lento do Next.js)
# - Health check com 20 tentativas e 5s intervalo (100s total)
# - Wrapper com NODE_OPTIONS para memória
# ============================================================
set -e

APP_DIR="/var/www/helpdesk/app"
ENV_BACKUP="/var/www/helpdesk/.env.backup"
cd "$APP_DIR"

echo "[Deploy] === INICIANDO DEPLOY v5 ==="
echo "[Deploy] Diretório: $(pwd)"
echo "[Deploy] Node: $(node -v 2>/dev/null || echo 'NÃO ENCONTRADO')"
echo "[Deploy] Memória livre: $(free -m 2>/dev/null | grep Mem | awk '{print $4}')MB"

# ============================================================
# 1. RESTAURAR .env
# ============================================================
if [ ! -f ".env" ] && [ -f "$ENV_BACKUP" ]; then
  echo "[Deploy] Restaurando .env do backup..."
  cp "$ENV_BACKUP" .env
fi

if [ ! -f ".env" ]; then
  echo "[Deploy] ERRO: .env não encontrado!"
  exit 1
fi

# Backup do .env
cp .env "$ENV_BACKUP"

# ============================================================
# 2. CORREÇÕES ABACUS AI → VPS
# ============================================================

# 2a. Remover output absoluto do Prisma
if grep -q '/home/ubuntu/winner_tecnologia_site' prisma/schema.prisma 2>/dev/null; then
  echo "[Deploy] Corrigindo output do Prisma..."
  sed -i '/output.*winner_tecnologia_site/d' prisma/schema.prisma
fi

# 2b. Remover variáveis Abacus do .env
sed -i '/^NEXT_OUTPUT_MODE=/d' .env
sed -i '/^NEXT_DIST_DIR=/d' .env

# 2c. Corrigir next.config.js para VPS
if grep -q 'outputFileTracingRoot' next.config.js 2>/dev/null; then
  echo "[Deploy] Corrigindo next.config.js..."
  sed -i '/outputFileTracingRoot/d' next.config.js
  # Remover bloco experimental vazio
  python3 -c "
import re
with open('next.config.js','r') as f: c = f.read()
c = re.sub(r'experimental\s*:\s*\{\s*\},?\s*\n?', '', c)
with open('next.config.js','w') as f: f.write(c)
" 2>/dev/null || true
fi

# 2d. Corrigir .yarnrc.yml
if [ -f ".yarnrc.yml" ] && grep -q '/opt/hostedapp' .yarnrc.yml 2>/dev/null; then
  echo "[Deploy] Corrigindo .yarnrc.yml..."
  echo 'nodeLinker: node-modules' > .yarnrc.yml
fi

# Limpar env shell
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

echo "[Deploy] Limpando build anterior..."
rm -rf .next

echo "[Deploy] Executando build..."
NODE_OPTIONS="--max-old-space-size=4096" yarn build

# Verificar build
if [ ! -f ".next/BUILD_ID" ]; then
  echo "[Deploy] ERRO FATAL: Build não gerou .next/BUILD_ID!"
  exit 1
fi

# Verificar se as páginas foram geradas
if [ ! -d ".next/server/app" ]; then
  echo "[Deploy] ERRO FATAL: .next/server/app não existe!"
  ls -la .next/server/ 2>/dev/null
  exit 1
fi

echo "[Deploy] ✅ Build concluído. BUILD_ID: $(cat .next/BUILD_ID)"
echo "[Deploy] Páginas geradas: $(find .next/server/app -name '*.js' | wc -l)"

# ============================================================
# 4. PARAR TUDO + LIBERAR PORTA 3000 (GARANTIDO)
# ============================================================

echo "[Deploy] === PARANDO APLICAÇÃO ==="

# 4a. Parar PM2 com timeout longo
if command -v pm2 &> /dev/null; then
  pm2 stop winner-helpdesk 2>/dev/null || true
  pm2 stop helpdesk 2>/dev/null || true
  sleep 3
  pm2 delete winner-helpdesk 2>/dev/null || true
  pm2 delete helpdesk 2>/dev/null || true
  sleep 2
fi

# 4b. Matar TODOS os processos na porta 3000 (três métodos)
echo "[Deploy] Liberando porta 3000..."

# Método 1: lsof
PIDS=$(lsof -ti:3000 2>/dev/null || true)
if [ -n "$PIDS" ]; then
  echo "[Deploy] Matando PIDs via lsof: $PIDS"
  echo "$PIDS" | xargs kill -9 2>/dev/null || true
fi

# Método 2: fuser
fuser -k 3000/tcp 2>/dev/null || true

# Método 3: ss + grep
SS_PIDS=$(ss -tlnp 2>/dev/null | grep ':3000' | grep -oP 'pid=\K[0-9]+' || true)
if [ -n "$SS_PIDS" ]; then
  echo "[Deploy] Matando PIDs via ss: $SS_PIDS"
  echo "$SS_PIDS" | xargs kill -9 2>/dev/null || true
fi

# 4c. Polling: esperar porta 3000 ficar livre (máx 30s)
echo "[Deploy] Aguardando porta 3000 ficar livre..."
for i in $(seq 1 15); do
  if ! ss -tlnp 2>/dev/null | grep -q ':3000'; then
    echo "[Deploy] ✅ Porta 3000 livre na tentativa $i"
    break
  fi
  echo "[Deploy] Porta 3000 ainda ocupada (tentativa $i/15)..."
  sleep 2
done

# Verificação final
if ss -tlnp 2>/dev/null | grep -q ':3000'; then
  echo "[Deploy] ❌ ERRO: Porta 3000 não liberou após 30s!"
  ss -tlnp | grep ':3000' || true
  # Último recurso
  fuser -k -9 3000/tcp 2>/dev/null || true
  sleep 3
fi

# ============================================================
# 5. INICIAR PM2
# ============================================================

echo "[Deploy] === INICIANDO APLICAÇÃO ==="
echo "[Deploy] Memória livre antes do start: $(free -m 2>/dev/null | grep Mem | awk '{print $4}')MB"

# Criar ecosystem robusto
cat > "$APP_DIR/ecosystem.config.js" << 'ECOEOF'
module.exports = {
  apps: [{
    name: 'winner-helpdesk',
    cwd: '/var/www/helpdesk/app',
    interpreter: 'node',
    script: 'node_modules/next/dist/bin/next',
    args: 'start -p 3000',
    exec_mode: 'fork',
    instances: 1,
    autorestart: true,
    max_restarts: 3,
    min_uptime: '15s',
    restart_delay: 5000,
    kill_timeout: 30000,
    listen_timeout: 30000,
    node_args: '--max-old-space-size=1024',
    env: {
      NODE_ENV: 'production',
      PORT: '3000'
    }
  }]
};
ECOEOF

echo "[Deploy] Iniciando PM2..."
RUNNER_TRACKING_ID="" pm2 start "$APP_DIR/ecosystem.config.js"

# Aguardar Next.js compilar/iniciar (precisa de tempo em VPS)
echo "[Deploy] Aguardando Next.js iniciar (25s)..."
sleep 25

echo "[Deploy] Status PM2:"
pm2 list

# ============================================================
# 6. HEALTH CHECK ROBUSTO
# ============================================================

echo "[Deploy] === HEALTH CHECK ==="
SUCCESS=false

for i in $(seq 1 20); do
  # Verificar se PM2 ainda está rodando
  PM2_STATUS=$(pm2 jlist 2>/dev/null | python3 -c "
import sys,json
try:
  d=json.load(sys.stdin)
  for p in d:
    if p['name']=='winner-helpdesk':
      print(p['pm2_env']['status'])
      break
except: print('unknown')
" 2>/dev/null || echo "unknown")

  if [ "$PM2_STATUS" = "errored" ] || [ "$PM2_STATUS" = "stopped" ]; then
    echo "[Deploy] ⚠️ PM2 status: $PM2_STATUS na tentativa $i — tentando recuperar..."
    # Matar porta e reiniciar
    fuser -k 3000/tcp 2>/dev/null || true
    sleep 3
    pm2 delete winner-helpdesk 2>/dev/null || true
    sleep 2
    RUNNER_TRACKING_ID="" pm2 start "$APP_DIR/ecosystem.config.js"
    sleep 20
    continue
  fi

  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 --max-time 10 http://localhost:3000/login 2>/dev/null || echo "000")

  if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "302" ] || [ "$HTTP_CODE" = "307" ]; then
    echo "[Deploy] ✅ App respondendo! (HTTP $HTTP_CODE) na tentativa $i"
    SUCCESS=true
    break
  else
    echo "[Deploy] Tentativa $i/20 - HTTP $HTTP_CODE | PM2: $PM2_STATUS"
  fi
  sleep 5
done

if [ "$SUCCESS" = true ]; then
  RUNNER_TRACKING_ID="" pm2 save --force
  echo "[Deploy] ✅ PM2 salvo"
  pm2 list
  echo "[Deploy] ✅✅✅ DEPLOY CONCLUÍDO COM SUCESSO ✅✅✅"
else
  echo "[Deploy] ❌ DEPLOY FALHOU — App não respondeu após todas as tentativas"
  echo ""
  echo "=== PM2 STATUS ==="
  pm2 list
  echo ""
  echo "=== PM2 OUT LOGS (últimas 30 linhas) ==="
  pm2 logs winner-helpdesk --out --nostream --lines 30 2>/dev/null || true
  echo ""
  echo "=== PM2 ERROR LOGS (últimas 30 linhas) ==="
  pm2 logs winner-helpdesk --err --nostream --lines 30 2>/dev/null || true
  echo ""
  echo "=== PORTA 3000 ==="
  ss -tlnp | grep ':3000' || echo "Porta 3000 livre"
  echo ""
  echo "=== MEMÓRIA ==="
  free -m 2>/dev/null || true
  echo ""
  echo "[Deploy] Para recuperar manualmente:"
  echo "  pm2 delete winner-helpdesk"
  echo "  fuser -k 3000/tcp"
  echo "  pm2 start /var/www/helpdesk/app/ecosystem.config.js"
fi

echo "[Deploy] === FIM DO DEPLOY ==="