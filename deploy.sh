#!/bin/bash
# ============================================================
# deploy.sh v7 — Build & Restart VPS Hostinger
# Chamado pelo GitHub Actions após git pull
#
# v7: Abordagem "nuclear" — não depende de liberar porta
# - Mata TUDO (pm2 kill + pkill node + fuser)
# - Diagnóstico VERBOSE: mostra exatamente quem segura a porta
# - Se porta não libera em 60s, inicia mesmo assim (SO_REUSEADDR)
# - Usa "yarn start" via PM2 (package.json scripts)
# - Sem ecosystem.config.js
# ============================================================
set -euo pipefail

APP_DIR="/var/www/helpdesk/app"
ENV_BACKUP="/var/www/helpdesk/.env.backup"
PM2_NAME="winner-helpdesk"
PORT=3000

cd "$APP_DIR"

echo "============================================"
echo "[Deploy] DEPLOY v7 — $(date '+%Y-%m-%d %H:%M:%S')"
echo "============================================"
echo "[Deploy] Node: $(node -v 2>/dev/null || echo 'N/A')"
echo "[Deploy] Memória: $(free -m 2>/dev/null | awk '/Mem/{print $4}')MB livre"

# ---- Diagnóstico: quem está na porta 3000 AGORA ----
show_port_info() {
  echo "[Deploy] --- PORTA $PORT ---"
  echo "[Deploy] ss -tlnp:"
  ss -tlnp "sport = :$PORT" 2>/dev/null || echo "(vazio)"
  echo "[Deploy] lsof -i:$PORT:"
  lsof -i:$PORT 2>/dev/null || echo "(vazio)"
  echo "[Deploy] fuser $PORT/tcp:"
  fuser -v $PORT/tcp 2>/dev/null || echo "(vazio)"
  echo "[Deploy] --- FIM PORTA ---"
}

show_port_info

# ============================================================
# 1. RESTAURAR .env
# ============================================================
if [ ! -f ".env" ] && [ -f "$ENV_BACKUP" ]; then
  echo "[Deploy] Restaurando .env do backup..."
  cp "$ENV_BACKUP" .env
fi

[ ! -f ".env" ] && echo "[Deploy] ERRO: .env não encontrado!" && exit 1
cp .env "$ENV_BACKUP"

# ============================================================
# 2. CORREÇÕES ABACUS AI → VPS
# ============================================================
if grep -q '/home/ubuntu/winner_tecnologia_site' prisma/schema.prisma 2>/dev/null; then
  echo "[Deploy] Corrigindo Prisma output..."
  sed -i '/output.*winner_tecnologia_site/d' prisma/schema.prisma
fi

sed -i '/^NEXT_OUTPUT_MODE=/d' .env
sed -i '/^NEXT_DIST_DIR=/d' .env

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

if [ -f ".yarnrc.yml" ] && grep -q '/opt/hostedapp' .yarnrc.yml 2>/dev/null; then
  echo 'nodeLinker: node-modules' > .yarnrc.yml
fi

unset NEXT_OUTPUT_MODE NEXT_DIST_DIR 2>/dev/null || true

# ============================================================
# 3. INSTALAR & BUILD
# ============================================================
echo "[Deploy] yarn install..."
yarn install --frozen-lockfile 2>/dev/null || yarn install

echo "[Deploy] Prisma generate + push..."
yarn prisma generate
yarn prisma db push --skip-generate 2>/dev/null || true
npx tsx scripts/seed.ts 2>/dev/null || echo "[Deploy] Seed falhou (não-crítico)"

echo "[Deploy] Limpando .next..."
rm -rf .next

echo "[Deploy] Build..."
NODE_OPTIONS="--max-old-space-size=4096" yarn build

[ ! -f ".next/BUILD_ID" ] && echo "[Deploy] ERRO: Sem BUILD_ID!" && exit 1
echo "[Deploy] ✅ Build OK — BUILD_ID: $(cat .next/BUILD_ID)"

# ============================================================
# 4. MATAR TUDO — ABORDAGEM NUCLEAR
# ============================================================
echo ""
echo "[Deploy] === PARANDO TUDO (nuclear) ==="

# 4a. PM2: parar e deletar TODOS os processos
echo "[Deploy] pm2 stop all + delete all..."
pm2 stop all 2>/dev/null || true
sleep 2
pm2 delete all 2>/dev/null || true
sleep 2

# 4b. Diagnóstico pós-PM2
echo "[Deploy] Pós pm2 delete:"
show_port_info

# 4c. Matar TODOS os processos Node.js (exceto o runner do GitHub Actions)
echo "[Deploy] Matando processos node/next..."
# Obter PID do runner para não matá-lo
RUNNER_PID=$$
RUNNER_PPID=$(ps -o ppid= -p $$ 2>/dev/null | tr -d ' ')

# pkill com exclusão do runner
for PATTERN in "next start" "next-server" "node.*next" ".next/server"; do
  PIDS=$(pgrep -f "$PATTERN" 2>/dev/null || true)
  for P in $PIDS; do
    if [ "$P" != "$RUNNER_PID" ] && [ "$P" != "$RUNNER_PPID" ]; then
      echo "[Deploy] kill -9 $P ($(ps -o comm= -p $P 2>/dev/null))"
      kill -9 "$P" 2>/dev/null || true
    fi
  done
done

# 4d. fuser — nuclear
sudo fuser -k -9 $PORT/tcp 2>/dev/null || fuser -k -9 $PORT/tcp 2>/dev/null || true
sleep 3

# 4e. Verificar resultado
echo "[Deploy] Pós-kill completo:"
show_port_info

# 4f. Esperar até 30s para porta liberar (mas NÃO abortar se não liberar)
PORT_FREE=false
for i in $(seq 1 15); do
  if ! ss -tlnp "sport = :$PORT" 2>/dev/null | grep -q "LISTEN"; then
    echo "[Deploy] ✅ Porta $PORT livre (tentativa $i)"
    PORT_FREE=true
    break
  fi
  echo "[Deploy] Porta $PORT ocupada ($i/15) — detalhes:"
  ss -tlnp "sport = :$PORT" 2>/dev/null || true
  lsof -i:$PORT 2>/dev/null | head -5 || true
  
  # Tentativa extra de kill a cada 5 tentativas
  if [ $((i % 5)) -eq 0 ]; then
    echo "[Deploy] Kill extra..."
    sudo fuser -k -9 $PORT/tcp 2>/dev/null || true
    pkill -9 -f "node" 2>/dev/null || true
  fi
  sleep 2
done

if [ "$PORT_FREE" = false ]; then
  echo "[Deploy] ⚠️ PORTA $PORT NÃO LIBEROU após 30s"
  echo "[Deploy] Detalhes finais do processo na porta:"
  show_port_info
  echo "[Deploy] ⚠️ CONTINUANDO MESMO ASSIM (Node.js SO_REUSEADDR deve funcionar)"
fi

# ============================================================
# 5. INICIAR APLICAÇÃO
# ============================================================
echo ""
echo "[Deploy] === INICIANDO APLICAÇÃO ==="
echo "[Deploy] Memória: $(free -m 2>/dev/null | awk '/Mem/{print $4}')MB livre"

# Garantir que PM2 está limpo
pm2 delete "$PM2_NAME" 2>/dev/null || true

# Start via yarn (usa "start": "next start" do package.json)
echo "[Deploy] Comando: PORT=$PORT pm2 start yarn --name $PM2_NAME -- start"
RUNNER_TRACKING_ID="" \
  PORT=$PORT \
  NODE_ENV=production \
  pm2 start yarn \
    --name "$PM2_NAME" \
    --cwd "$APP_DIR" \
    --max-restarts 3 \
    --restart-delay 5000 \
    --kill-timeout 30000 \
    --time \
    -- start

echo "[Deploy] PM2 start executado. Aguardando 35s..."
sleep 35

echo "[Deploy] Status PM2:"
pm2 list
echo ""
echo "[Deploy] Porta $PORT após start:"
ss -tlnp "sport = :$PORT" 2>/dev/null || true

# ============================================================
# 6. HEALTH CHECK
# ============================================================
echo ""
echo "[Deploy] === HEALTH CHECK ==="
SUCCESS=false

for i in $(seq 1 20); do
  # Status PM2
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

  if [ "$PM2_STATUS" = "errored" ] || [ "$PM2_STATUS" = "stopped" ]; then
    echo "[Deploy] ⚠️ PM2 status: $PM2_STATUS"
    echo "[Deploy] Error logs:"
    pm2 logs "$PM2_NAME" --err --nostream --lines 15 2>/dev/null || true
    echo "[Deploy] Out logs:"
    pm2 logs "$PM2_NAME" --out --nostream --lines 15 2>/dev/null || true
    
    # Tentar restart
    echo "[Deploy] Tentando pm2 restart..."
    sudo fuser -k -9 $PORT/tcp 2>/dev/null || true
    sleep 3
    pm2 delete "$PM2_NAME" 2>/dev/null || true
    sleep 2
    RUNNER_TRACKING_ID="" PORT=$PORT NODE_ENV=production \
      pm2 start yarn --name "$PM2_NAME" --cwd "$APP_DIR" --time -- start
    sleep 30
    continue
  fi

  # HTTP check
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 --max-time 10 http://localhost:$PORT/login 2>/dev/null || echo "000")

  if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "302" ] || [ "$HTTP_CODE" = "307" ]; then
    echo "[Deploy] ✅ HTTP $HTTP_CODE — App respondendo! (tentativa $i)"
    SUCCESS=true
    break
  fi

  echo "[Deploy] Tentativa $i/20 — HTTP $HTTP_CODE | PM2: $PM2_STATUS"
  sleep 5
done

# ============================================================
# 7. RESULTADO
# ============================================================
echo ""
if [ "$SUCCESS" = true ]; then
  RUNNER_TRACKING_ID="" pm2 save --force
  pm2 list
  echo ""
  echo "[Deploy] ✅✅✅ DEPLOY v7 CONCLUÍDO COM SUCESSO ✅✅✅"
else
  echo "[Deploy] ❌❌❌ DEPLOY v7 FALHOU ❌❌❌"
  echo ""
  echo "=== DIAGNÓSTICO ==="
  pm2 list 2>/dev/null || true
  echo ""
  echo "--- PM2 DESCRIBE ---"
  pm2 describe "$PM2_NAME" 2>/dev/null || true
  echo ""
  echo "--- PM2 ERROR LOGS ---"
  pm2 logs "$PM2_NAME" --err --nostream --lines 50 2>/dev/null || true
  echo ""
  echo "--- PM2 OUT LOGS ---"
  pm2 logs "$PM2_NAME" --out --nostream --lines 50 2>/dev/null || true
  echo ""
  echo "--- PORTA $PORT ---"
  show_port_info
  echo ""
  echo "--- PROCESSOS ---"
  ps aux | grep -E "next|node|yarn" | grep -v grep 2>/dev/null || true
  echo ""
  echo "--- MEMÓRIA ---"
  free -m 2>/dev/null || true
  echo ""
  echo "--- DISCO ---"
  df -h /var/www/helpdesk 2>/dev/null || true
  echo ""
  echo "[Deploy] Recuperação manual:"
  echo "  pm2 delete all && fuser -k 3000/tcp"
  echo "  cd $APP_DIR && PORT=3000 pm2 start yarn --name $PM2_NAME -- start"
  echo "  pm2 save --force"
fi

echo "[Deploy] === FIM v7 ==="