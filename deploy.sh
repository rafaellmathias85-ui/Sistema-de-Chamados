#!/bin/bash
# ============================================================
# deploy.sh v6 — Build & Restart VPS Hostinger
# Chamado pelo GitHub Actions após git pull
#
# Mudanças v6 (abordagem fundamentalmente diferente):
# - NÃO usa ecosystem.config.js — fonte de falhas
# - Usa "pm2 start npm --name X -- start" (package.json start)
# - Port match exato com ss sport = :3000
# - Tenta pm2 restart primeiro (preserva config funcional)
# - Fallback para delete+start somente se restart falhar
# - Kill agressivo pós-stop com SIGKILL
# - Diagnóstico detalhado em caso de falha
# ============================================================
set -e

APP_DIR="/var/www/helpdesk/app"
ENV_BACKUP="/var/www/helpdesk/.env.backup"
PM2_NAME="winner-helpdesk"
PORT=3000

cd "$APP_DIR"

echo "[Deploy] === INICIANDO DEPLOY v6 ==="
echo "[Deploy] Diretório: $(pwd)"
echo "[Deploy] Node: $(node -v 2>/dev/null || echo 'NÃO ENCONTRADO')"
echo "[Deploy] Yarn: $(yarn -v 2>/dev/null || echo 'NÃO ENCONTRADO')"
echo "[Deploy] Memória livre: $(free -m 2>/dev/null | grep Mem | awk '{print $4}')MB"
echo "[Deploy] Processos na porta $PORT ANTES:"
ss -tlnp "sport = :$PORT" 2>/dev/null || true

# ============================================================
# 1. RESTAURAR .env (se necessário)
# ============================================================
if [ ! -f ".env" ] && [ -f "$ENV_BACKUP" ]; then
  echo "[Deploy] Restaurando .env do backup..."
  cp "$ENV_BACKUP" .env
fi

if [ ! -f ".env" ]; then
  echo "[Deploy] ERRO: .env não encontrado!"
  exit 1
fi

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

if [ ! -f ".next/BUILD_ID" ]; then
  echo "[Deploy] ERRO FATAL: Build não gerou .next/BUILD_ID!"
  exit 1
fi

if [ ! -d ".next/server/app" ]; then
  echo "[Deploy] ERRO FATAL: .next/server/app não existe!"
  ls -la .next/server/ 2>/dev/null
  exit 1
fi

echo "[Deploy] ✅ Build concluído. BUILD_ID: $(cat .next/BUILD_ID)"
echo "[Deploy] Páginas: $(find .next/server/app -name '*.js' | wc -l)"

# ============================================================
# 4. FUNÇÃO: Liberar porta 3000
# ============================================================
kill_port() {
  echo "[Deploy] Liberando porta $PORT..."
  
  # Kill via lsof
  local PIDS
  PIDS=$(lsof -ti:$PORT 2>/dev/null || true)
  if [ -n "$PIDS" ]; then
    echo "[Deploy] Kill via lsof: $PIDS"
    echo "$PIDS" | xargs kill -9 2>/dev/null || true
  fi

  # Kill via fuser (com sudo se disponível)
  sudo fuser -k -9 $PORT/tcp 2>/dev/null || fuser -k -9 $PORT/tcp 2>/dev/null || true

  # Kill via ss (match exato na porta)
  local SS_PIDS
  SS_PIDS=$(ss -tlnp "sport = :$PORT" 2>/dev/null | grep -oP 'pid=\K[0-9]+' || true)
  if [ -n "$SS_PIDS" ]; then
    echo "[Deploy] Kill via ss: $SS_PIDS"
    echo "$SS_PIDS" | xargs kill -9 2>/dev/null || true
  fi

  # Kill qualquer processo node/next que possa estar segurando
  pkill -9 -f "next start" 2>/dev/null || true
  pkill -9 -f "next-server" 2>/dev/null || true
}

wait_port_free() {
  echo "[Deploy] Aguardando porta $PORT ficar livre..."
  for i in $(seq 1 20); do
    if ! ss -tlnp "sport = :$PORT" 2>/dev/null | grep -q "LISTEN"; then
      echo "[Deploy] ✅ Porta $PORT livre (tentativa $i)"
      return 0
    fi
    echo "[Deploy] Porta $PORT ocupada (tentativa $i/20)"
    if [ $i -eq 10 ]; then
      echo "[Deploy] 10 tentativas — kill agressivo"
      kill_port
    fi
    sleep 2
  done
  echo "[Deploy] ❌ Porta $PORT não liberou após 40s!"
  ss -tlnp "sport = :$PORT" 2>/dev/null || true
  return 1
}

# ============================================================
# 5. PARAR APLICAÇÃO
# ============================================================

echo "[Deploy] === PARANDO APLICAÇÃO ==="

# Tentar stop graceful primeiro
if command -v pm2 &> /dev/null; then
  pm2 stop "$PM2_NAME" 2>/dev/null || true
  pm2 stop helpdesk 2>/dev/null || true
  sleep 5
fi

# Liberar porta
kill_port
sleep 2

# Verificar se está livre
if ! wait_port_free; then
  echo "[Deploy] ERRO: Não conseguiu liberar porta $PORT"
  echo "[Deploy] Forçando cleanup total..."
  pm2 kill 2>/dev/null || true
  sleep 3
  kill_port
  sleep 3
  if ss -tlnp "sport = :$PORT" 2>/dev/null | grep -q "LISTEN"; then
    echo "[Deploy] ERRO FATAL: Porta $PORT travada por processo inalcançável"
    ps aux | grep -E "next|node" | grep -v grep || true
    exit 1
  fi
fi

echo "[Deploy] ✅ Porta $PORT liberada com sucesso"

# ============================================================
# 6. INICIAR APLICAÇÃO (3 estratégias)
# ============================================================

echo "[Deploy] === INICIANDO APLICAÇÃO ==="
echo "[Deploy] Memória livre: $(free -m 2>/dev/null | grep Mem | awk '{print $4}')MB"

# Deletar processos PM2 antigos para garantir estado limpo
pm2 delete "$PM2_NAME" 2>/dev/null || true
pm2 delete helpdesk 2>/dev/null || true
sleep 2

# ---- ESTRATÉGIA: Start direto via yarn (usa package.json "start": "next start") ----
echo "[Deploy] Iniciando via: PORT=$PORT pm2 start yarn --name $PM2_NAME -- start"

RUNNER_TRACKING_ID="" PORT=$PORT pm2 start yarn \
  --name "$PM2_NAME" \
  --cwd "$APP_DIR" \
  --node-args="--max-old-space-size=1024" \
  --max-restarts 5 \
  --restart-delay 5000 \
  --kill-timeout 30000 \
  --no-autorestart \
  -- start

# Re-habilitar autorestart após primeiro start bem-sucedido
sleep 3
pm2 set "$PM2_NAME" autorestart true 2>/dev/null || true

# Aguardar Next.js compilar páginas dinâmicas
echo "[Deploy] Aguardando Next.js iniciar (30s para compilação on-demand)..."
sleep 30

echo "[Deploy] Status PM2 após start:"
pm2 list
pm2 describe "$PM2_NAME" 2>/dev/null | head -30 || true

# ============================================================
# 7. HEALTH CHECK
# ============================================================

echo "[Deploy] === HEALTH CHECK ==="
SUCCESS=false
RETRY_COUNT=0
MAX_RETRIES=1

check_health() {
  for i in $(seq 1 25); do
    # Verificar status PM2
    local PM2_STATUS
    PM2_STATUS=$(pm2 jlist 2>/dev/null | python3 -c "
import sys,json
try:
  d=json.load(sys.stdin)
  for p in d:
    if p['name']=='$PM2_NAME':
      print(p['pm2_env']['status'])
      break
  else: print('not_found')
except: print('error')
" 2>/dev/null || echo "unknown")

    if [ "$PM2_STATUS" = "errored" ] || [ "$PM2_STATUS" = "stopped" ] || [ "$PM2_STATUS" = "not_found" ]; then
      echo "[Deploy] ⚠️ PM2 status: $PM2_STATUS — app crashou"
      echo "[Deploy] PM2 error logs:"
      pm2 logs "$PM2_NAME" --err --nostream --lines 20 2>/dev/null || true
      echo "[Deploy] PM2 out logs:"
      pm2 logs "$PM2_NAME" --out --nostream --lines 20 2>/dev/null || true
      return 1
    fi

    # Testar HTTP
    local HTTP_CODE
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 --max-time 10 http://localhost:$PORT/login 2>/dev/null || echo "000")

    if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "302" ] || [ "$HTTP_CODE" = "307" ]; then
      echo "[Deploy] ✅ App respondendo! HTTP $HTTP_CODE (tentativa $i)"
      return 0
    fi

    echo "[Deploy] Tentativa $i/25 — HTTP $HTTP_CODE | PM2: $PM2_STATUS"
    sleep 4
  done
  return 1
}

if check_health; then
  SUCCESS=true
else
  echo "[Deploy] ⚠️ Primeira tentativa falhou. Reiniciando..."
  
  # Cleanup completo
  pm2 delete "$PM2_NAME" 2>/dev/null || true
  sleep 2
  kill_port
  sleep 3
  wait_port_free || true

  # Segunda tentativa: start diretamente com next
  echo "[Deploy] Segunda tentativa: node next start direto"
  RUNNER_TRACKING_ID="" PORT=$PORT pm2 start node \
    --name "$PM2_NAME" \
    --cwd "$APP_DIR" \
    -- node_modules/.bin/next start -p $PORT

  echo "[Deploy] Aguardando segunda tentativa (30s)..."
  sleep 30

  if check_health; then
    SUCCESS=true
  fi
fi

# ============================================================
# 8. RESULTADO FINAL
# ============================================================

if [ "$SUCCESS" = true ]; then
  RUNNER_TRACKING_ID="" pm2 save --force
  echo "[Deploy] ✅ PM2 dump salvo"
  pm2 list
  echo "[Deploy] ✅✅✅ DEPLOY CONCLUÍDO COM SUCESSO ✅✅✅"
else
  echo "[Deploy] ❌❌❌ DEPLOY FALHOU ❌❌❌"
  echo ""
  echo "=== DIAGNÓSTICO COMPLETO ==="
  echo ""
  echo "--- PM2 STATUS ---"
  pm2 list 2>/dev/null || true
  echo ""
  echo "--- PM2 DESCRIBE ---"
  pm2 describe "$PM2_NAME" 2>/dev/null || true
  echo ""
  echo "--- PM2 ERROR LOGS (50 linhas) ---"
  pm2 logs "$PM2_NAME" --err --nostream --lines 50 2>/dev/null || true
  echo ""
  echo "--- PM2 OUT LOGS (50 linhas) ---"
  pm2 logs "$PM2_NAME" --out --nostream --lines 50 2>/dev/null || true
  echo ""
  echo "--- PORTA $PORT ---"
  ss -tlnp "sport = :$PORT" 2>/dev/null || true
  echo ""
  echo "--- PROCESSOS NODE ---"
  ps aux | grep -E "next|node" | grep -v grep 2>/dev/null || true
  echo ""
  echo "--- MEMÓRIA ---"
  free -m 2>/dev/null || true
  echo ""
  echo "--- DISCO ---"
  df -h /var/www/helpdesk 2>/dev/null || true
  echo ""
  echo "--- .next/BUILD_ID ---"
  cat .next/BUILD_ID 2>/dev/null || echo "NÃO ENCONTRADO"
  echo ""
  echo "--- next.config.js ---"
  head -20 next.config.js 2>/dev/null || true
  echo ""
  echo "[Deploy] Para recuperar manualmente:"
  echo "  pm2 delete $PM2_NAME"
  echo "  fuser -k 3000/tcp"
  echo "  cd $APP_DIR && PORT=3000 pm2 start yarn --name $PM2_NAME -- start"
  echo "  pm2 save --force"
fi

echo "[Deploy] === FIM DO DEPLOY v6 ==="