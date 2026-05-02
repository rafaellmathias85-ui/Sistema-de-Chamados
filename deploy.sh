#!/bin/bash
# ============================================================
# deploy.sh v8 — Build & Restart VPS Hostinger
# Chamado pelo GitHub Actions após git pull
#
# v8 — CORREÇÕES BASEADAS NO DEPLOY #36:
# 1. Mata processos órfãos do root (sudo kill) — causa do EADDRINUSE
# 2. Verifica/gera NEXTAUTH_SECRET no .env — causa do 404
# 3. Garante STORAGE_PROVIDER=local + UPLOADS_DIR no .env
# 4. Cria diretório de uploads com permissões corretas
# 5. Diagnóstico verbose mantido do v7
# ============================================================
set -uo pipefail

APP_DIR="/var/www/helpdesk/app"
ENV_BACKUP="/var/www/helpdesk/.env.backup"
PM2_NAME="winner-helpdesk"
PORT=3000
UPLOADS_DIR="/var/lib/helpdesk/uploads"

cd "$APP_DIR"

echo "============================================"
echo "[Deploy] DEPLOY v8 — $(date '+%Y-%m-%d %H:%M:%S')"
echo "============================================"
echo "[Deploy] Node: $(node -v 2>/dev/null || echo 'N/A')"
echo "[Deploy] Memória: $(free -m 2>/dev/null | awk '/Mem/{print $4}')MB livre"
echo "[Deploy] Usuário: $(whoami)"

show_port_info() {
  echo "[Deploy] --- PORTA $PORT ---"
  echo "[Deploy] ss -tlnp:"
  ss -tlnp "sport = :$PORT" 2>/dev/null || echo "(vazio)"
  echo "[Deploy] lsof -i:$PORT (com sudo):"
  sudo lsof -i:$PORT 2>/dev/null || lsof -i:$PORT 2>/dev/null || echo "(vazio)"
  echo "[Deploy] fuser $PORT/tcp (com sudo):"
  sudo fuser -v $PORT/tcp 2>/dev/null || fuser -v $PORT/tcp 2>/dev/null || echo "(vazio)"
  echo "[Deploy] --- FIM PORTA ---"
}

# ============================================================
# 0. LIMPEZA NUCLEAR ANTES DE TUDO (mata zumbis do root)
# ============================================================
echo ""
echo "[Deploy] === LIMPEZA NUCLEAR INICIAL ==="
show_port_info

echo "[Deploy] Identificando processos next-server/next start de QUALQUER usuário..."
# Listar processos antes de matar para o log
sudo ps -eo pid,user,comm,args 2>/dev/null | grep -E "next-server|next start|sh -c next" | grep -v grep || echo "(nenhum encontrado)"

echo "[Deploy] Matando processos com sudo..."
sudo pkill -9 -f "next-server" 2>/dev/null || true
sudo pkill -9 -f "sh -c next start" 2>/dev/null || true
sudo pkill -9 -f "next start" 2>/dev/null || true
sleep 2

echo "[Deploy] sudo fuser -k 3000/tcp..."
sudo fuser -k -9 $PORT/tcp 2>/dev/null || true
sleep 2

echo "[Deploy] Pós limpeza nuclear:"
show_port_info

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

# ============================================================
# 2. REPARAR/GARANTIR VARIÁVEIS CRÍTICAS NO .env
# ============================================================
echo ""
echo "[Deploy] === VERIFICANDO VARIÁVEIS CRÍTICAS NO .env ==="

# 2a. NEXTAUTH_SECRET — CRÍTICO para login funcionar
if ! grep -q "^NEXTAUTH_SECRET=" .env || [ -z "$(grep '^NEXTAUTH_SECRET=' .env | cut -d= -f2-)" ]; then
  echo "[Deploy] ⚠️ NEXTAUTH_SECRET ausente! Gerando novo secret..."
  NEW_SECRET=$(openssl rand -base64 48 | tr -d '\n')
  # Remover linha existente (mesmo que vazia) e adicionar nova
  sed -i '/^NEXTAUTH_SECRET=/d' .env
  echo "NEXTAUTH_SECRET=$NEW_SECRET" >> .env
  echo "[Deploy] ✅ NEXTAUTH_SECRET criado com sucesso"
else
  echo "[Deploy] ✅ NEXTAUTH_SECRET já configurado"
fi

# 2b. NEXTAUTH_URL — necessário para callbacks de auth
if ! grep -q "^NEXTAUTH_URL=" .env; then
  echo "[Deploy] ⚠️ NEXTAUTH_URL ausente! Configurando para wticorp.com.br"
  echo "NEXTAUTH_URL=https://wticorp.com.br" >> .env
fi

# 2c. STORAGE_PROVIDER=local — anexos no VPS, NÃO no S3
if ! grep -q "^STORAGE_PROVIDER=" .env; then
  echo "[Deploy] ⚠️ STORAGE_PROVIDER ausente! Configurando como local"
  echo "STORAGE_PROVIDER=local" >> .env
else
  CURRENT_PROVIDER=$(grep '^STORAGE_PROVIDER=' .env | cut -d= -f2- | tr -d '\"')
  if [ "$CURRENT_PROVIDER" != "local" ]; then
    echo "[Deploy] ⚠️ STORAGE_PROVIDER=$CURRENT_PROVIDER → corrigindo para local"
    sed -i 's/^STORAGE_PROVIDER=.*/STORAGE_PROVIDER=local/' .env
  else
    echo "[Deploy] ✅ STORAGE_PROVIDER=local"
  fi
fi

# 2d. UPLOADS_DIR — diretório onde os anexos ficam
if ! grep -q "^UPLOADS_DIR=" .env; then
  echo "[Deploy] Configurando UPLOADS_DIR=$UPLOADS_DIR"
  echo "UPLOADS_DIR=$UPLOADS_DIR" >> .env
fi

# 2e. NODE_ENV=production
if ! grep -q "^NODE_ENV=" .env; then
  echo "NODE_ENV=production" >> .env
fi

# Backup do .env (após reparos)
cp .env "$ENV_BACKUP"
echo "[Deploy] .env preservado em $ENV_BACKUP"

# ============================================================
# 3. GARANTIR DIRETÓRIO DE UPLOADS (storage local)
# ============================================================
echo ""
echo "[Deploy] === DIRETÓRIO DE UPLOADS ==="
UPLOADS_PATH=$(grep '^UPLOADS_DIR=' .env | cut -d= -f2- | tr -d '\"')
UPLOADS_PATH="${UPLOADS_PATH:-$UPLOADS_DIR}"

if [ ! -d "$UPLOADS_PATH" ]; then
  echo "[Deploy] Criando $UPLOADS_PATH..."
  sudo mkdir -p "$UPLOADS_PATH"
fi

# Garantir que o usuário ubuntu pode escrever
sudo chown -R ubuntu:ubuntu "$UPLOADS_PATH" 2>/dev/null || true
sudo chmod -R 755 "$UPLOADS_PATH" 2>/dev/null || true

echo "[Deploy] ✅ Uploads em $UPLOADS_PATH ($(du -sh $UPLOADS_PATH 2>/dev/null | cut -f1) usado)"

# ============================================================
# 4. CORREÇÕES ABACUS AI → VPS
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
# 5. INSTALAR & BUILD
# ============================================================
echo ""
echo "[Deploy] === BUILD ==="
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
# 6. PARAR APLICAÇÃO (com PM2 + sudo kill)
# ============================================================
echo ""
echo "[Deploy] === PARANDO APLICAÇÃO ==="

# 6a. PM2 stop + delete
pm2 stop all 2>/dev/null || true
sleep 2
pm2 delete all 2>/dev/null || true
sleep 2

# 6b. Limpeza nuclear novamente (após pm2 stop pode ter criado novos órfãos)
echo "[Deploy] Matando órfãos pós-PM2 (com sudo)..."
sudo pkill -9 -f "next-server" 2>/dev/null || true
sudo pkill -9 -f "sh -c next start" 2>/dev/null || true
sudo pkill -9 -f "next start" 2>/dev/null || true
sudo fuser -k -9 $PORT/tcp 2>/dev/null || true
sleep 3

# 6c. Verificar
PORT_FREE=false
for i in $(seq 1 10); do
  if ! ss -tlnp "sport = :$PORT" 2>/dev/null | grep -q "LISTEN"; then
    echo "[Deploy] ✅ Porta $PORT livre (tentativa $i)"
    PORT_FREE=true
    break
  fi
  echo "[Deploy] Porta ocupada ($i/10) — kill extra..."
  sudo fuser -k -9 $PORT/tcp 2>/dev/null || true
  sudo pkill -9 -f "node" 2>/dev/null || true
  sleep 2
done

if [ "$PORT_FREE" = false ]; then
  echo "[Deploy] ⚠️ Porta ainda ocupada após 20s — diagnóstico:"
  show_port_info
  echo "[Deploy] Continuando mesmo assim..."
fi

# ============================================================
# 7. INICIAR APLICAÇÃO
# ============================================================
echo ""
echo "[Deploy] === INICIANDO APLICAÇÃO ==="
echo "[Deploy] Memória: $(free -m 2>/dev/null | awk '/Mem/{print $4}')MB livre"

pm2 delete "$PM2_NAME" 2>/dev/null || true

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

echo "[Deploy] Aguardando 35s..."
sleep 35

echo "[Deploy] Status PM2:"
pm2 list

# ============================================================
# 8. HEALTH CHECK
# ============================================================
echo ""
echo "[Deploy] === HEALTH CHECK ==="
SUCCESS=false

for i in $(seq 1 20); do
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
    pm2 logs "$PM2_NAME" --err --nostream --lines 15 2>/dev/null || true
    
    # Auto-recovery
    sudo fuser -k -9 $PORT/tcp 2>/dev/null || true
    sudo pkill -9 -f "next-server" 2>/dev/null || true
    sleep 3
    pm2 delete "$PM2_NAME" 2>/dev/null || true
    sleep 2
    RUNNER_TRACKING_ID="" PORT=$PORT NODE_ENV=production \
      pm2 start yarn --name "$PM2_NAME" --cwd "$APP_DIR" --time -- start
    sleep 30
    continue
  fi

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
# 9. RESULTADO
# ============================================================
echo ""
if [ "$SUCCESS" = true ]; then
  RUNNER_TRACKING_ID="" pm2 save --force
  pm2 list
  echo ""
  echo "[Deploy] ✅✅✅ DEPLOY v8 CONCLUÍDO COM SUCESSO ✅✅✅"
else
  echo "[Deploy] ❌❌❌ DEPLOY v8 FALHOU ❌❌❌"
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
  pm2 logs "$PM2_NAME" --out --nostream --lines 30 2>/dev/null || true
  echo ""
  echo "--- PORTA $PORT ---"
  show_port_info
  echo ""
  echo "--- PROCESSOS ---"
  sudo ps -eo pid,user,comm,args 2>/dev/null | grep -E "next|node|yarn" | grep -v grep || true
  echo ""
  echo "--- .env (vars críticas) ---"
  grep -E "^(NEXTAUTH_SECRET|NEXTAUTH_URL|STORAGE_PROVIDER|UPLOADS_DIR|NODE_ENV)=" .env | sed 's/SECRET=.*/SECRET=***REDACTED***/' || true
  echo ""
  echo "--- MEMÓRIA ---"
  free -m 2>/dev/null || true
  echo ""
  echo "[Deploy] Recuperação manual:"
  echo "  sudo pkill -9 -f next-server"
  echo "  sudo fuser -k 3000/tcp"
  echo "  pm2 delete all"
  echo "  cd $APP_DIR && PORT=3000 pm2 start yarn --name $PM2_NAME -- start"
  echo "  pm2 save --force"
fi

echo "[Deploy] === FIM v8 ==="