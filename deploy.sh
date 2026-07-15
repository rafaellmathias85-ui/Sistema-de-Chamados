#!/bin/bash
# ============================================================
# deploy.sh v9 — Build & Restart VPS Hostinger
# Chamado pelo GitHub Actions após git pull
#
# v9 — CORREÇÕES ESTRUTURAIS BASEADAS NO DEPLOY #37:
# 1. PM2 SEMPRE como usuário ubuntu (sudo -u ubuntu pm2 ...)
#    → impede daemon do PM2 rodar como root e criar zumbis
# 2. Inicia app com binário DIRETO do Next (não via yarn wrapper)
#    → evita filho órfão next-server quando yarn morre
# 3. pkill com escopo cirúrgico (next-server, não "node" genérico)
#    → não mata outros processos Node do sistema
# 4. Loop de port-free com early break (ss -tlnp)
#    → para no momento que porta libera
# 5. Aborta deploy se porta seguir ocupada (não tenta start em vão)
# 6. Detecta + migra PM2 do root → ubuntu se necessário
#
# v8 — fixes mantidos: NEXTAUTH_SECRET auto-gen, STORAGE_PROVIDER=local
# ============================================================
set -uo pipefail

APP_DIR="/var/www/helpdesk/app"
ENV_BACKUP="/var/www/helpdesk/.env.backup"
PM2_NAME="winner-helpdesk"
PORT=3000
UPLOADS_DIR="/var/lib/helpdesk/uploads"
APP_USER="ubuntu"

# Safety defaults: production deploy must not alter database data/schema unless
# an operator explicitly opts in after backup/review.
DEPLOY_RUN_STATUS_MIGRATION="${DEPLOY_RUN_STATUS_MIGRATION:-0}"
DEPLOY_DB_PUSH="${DEPLOY_DB_PUSH:-0}"
DEPLOY_RUN_SEED="${DEPLOY_RUN_SEED:-0}"

# Helper: roda comando pm2 como usuário ubuntu (não root)
pm2_u() {
  sudo -u "$APP_USER" pm2 "$@"
}

cd "$APP_DIR"

echo "============================================"
echo "[Deploy] DEPLOY v9 — $(date '+%Y-%m-%d %H:%M:%S')"
echo "============================================"
echo "[Deploy] Node: $(node -v 2>/dev/null || echo 'N/A')"
echo "[Deploy] Memória: $(free -m 2>/dev/null | awk '/Mem/{print $4}')MB livre"
echo "[Deploy] Usuário do script: $(whoami)"
echo "[Deploy] PM2 alvo: usuário '$APP_USER'"
echo "[Deploy] DB safety: status_migration=$DEPLOY_RUN_STATUS_MIGRATION db_push=$DEPLOY_DB_PUSH seed=$DEPLOY_RUN_SEED"

show_port_info() {
  echo "[Deploy] --- PORTA $PORT ---"
  echo "[Deploy] ss -tlnp:"
  sudo ss -tlnp "sport = :$PORT" 2>/dev/null || ss -tlnp "sport = :$PORT" 2>/dev/null || echo "(vazio)"
  echo "[Deploy] lsof -i:$PORT:"
  sudo lsof -i:$PORT 2>/dev/null || lsof -i:$PORT 2>/dev/null || echo "(vazio)"
  echo "[Deploy] --- FIM PORTA ---"
}

is_port_busy() {
  sudo ss -tlnp "sport = :$PORT" 2>/dev/null | grep -q "LISTEN" \
    || ss -tlnp "sport = :$PORT" 2>/dev/null | grep -q "LISTEN"
}

# ============================================================
# 0. DETECTAR & MIGRAR PM2 DO ROOT (se houver)
# ============================================================
echo ""
echo "[Deploy] === DETECTANDO PM2 DO ROOT ==="
if sudo -u root pm2 list 2>/dev/null | grep -q "$PM2_NAME"; then
  echo "[Deploy] ⚠️ PM2 do root detectado contendo '$PM2_NAME'. Migrando..."
  sudo pm2 delete all 2>/dev/null || true
  sudo pm2 kill 2>/dev/null || true
  sleep 2
  echo "[Deploy] ✅ PM2 do root limpo"
else
  echo "[Deploy] ✅ Nenhum PM2 problemático no root"
fi

# ============================================================
# 0b. LIMPEZA DE PROCESSOS ÓRFÃOS (escopo cirúrgico)
# ============================================================
echo ""
echo "[Deploy] === LIMPEZA DE ÓRFÃOS ==="
show_port_info

echo "[Deploy] Processos Next/yarn antes da limpeza:"
sudo ps -eo pid,user,comm,args 2>/dev/null | grep -E "next-server|yarn.*start|sh -c next" | grep -v grep || echo "(nenhum)"

echo "[Deploy] Matando órfãos (escopo cirúrgico, NÃO mata 'node' genérico)..."
sudo pkill -9 -f "next-server" 2>/dev/null || true
sudo pkill -9 -f "sh -c next start" 2>/dev/null || true
sudo pkill -9 -f "yarn.*start" 2>/dev/null || true
sudo pkill -9 -f "node .*next/dist/bin/next" 2>/dev/null || true
sleep 2

echo "[Deploy] Pós limpeza:"
show_port_info

# ============================================================
# 1. RESTAURAR .env
# ============================================================
if [ ! -f ".env" ] && [ -f "$ENV_BACKUP" ]; then
  echo "[Deploy] Restaurando .env do backup..."
  sudo cp "$ENV_BACKUP" .env
  sudo chown "$APP_USER:$APP_USER" .env
fi

if [ ! -f ".env" ]; then
  echo "[Deploy] ❌ ERRO: .env não encontrado!"
  exit 1
fi

# ============================================================
# 2. REPARAR/GARANTIR VARIÁVEIS CRÍTICAS NO .env
# ============================================================
echo ""
echo "[Deploy] === VARIÁVEIS CRÍTICAS NO .env ==="

# 2a. NEXTAUTH_SECRET — CRÍTICO
if ! grep -q "^NEXTAUTH_SECRET=" .env || [ -z "$(grep '^NEXTAUTH_SECRET=' .env | cut -d= -f2-)" ]; then
  echo "[Deploy] ⚠️ NEXTAUTH_SECRET ausente! Gerando novo secret..."
  NEW_SECRET=$(openssl rand -base64 48 | tr -d '\n')
  sed -i '/^NEXTAUTH_SECRET=/d' .env
  echo "NEXTAUTH_SECRET=$NEW_SECRET" >> .env
  echo "[Deploy] ✅ NEXTAUTH_SECRET criado"
else
  echo "[Deploy] ✅ NEXTAUTH_SECRET configurado"
fi

# 2b. NEXTAUTH_URL
if ! grep -q "^NEXTAUTH_URL=" .env; then
  echo "NEXTAUTH_URL=https://wticorp.com.br" >> .env
fi

# 2c. STORAGE_PROVIDER=local
if ! grep -q "^STORAGE_PROVIDER=" .env; then
  echo "STORAGE_PROVIDER=local" >> .env
else
  CURRENT_PROVIDER=$(grep '^STORAGE_PROVIDER=' .env | cut -d= -f2- | tr -d '\"')
  if [ "$CURRENT_PROVIDER" != "local" ]; then
    sed -i 's/^STORAGE_PROVIDER=.*/STORAGE_PROVIDER=local/' .env
  fi
fi
echo "[Deploy] ✅ STORAGE_PROVIDER=local"

# 2d. UPLOADS_DIR
if ! grep -q "^UPLOADS_DIR=" .env; then
  echo "UPLOADS_DIR=$UPLOADS_DIR" >> .env
fi

# 2e. NODE_ENV
if ! grep -q "^NODE_ENV=" .env; then
  echo "NODE_ENV=production" >> .env
fi

# 2f. CHROMIUM — geração local de PDFs (orçamentos, relatórios, inventário)
echo ""
echo "[Deploy] === CHROMIUM (PDF) ==="
CHROME_BIN=""
for c in /usr/bin/chromium-browser /usr/bin/chromium /usr/bin/google-chrome-stable /snap/bin/chromium; do
  if [ -x "$c" ]; then CHROME_BIN="$c"; break; fi
done
if [ -z "$CHROME_BIN" ]; then
  echo "[Deploy] Chromium ausente — instalando..."
  sudo apt-get update -qq && sudo apt-get install -y -qq chromium-browser 2>/dev/null \
    || sudo apt-get install -y -qq chromium 2>/dev/null \
    || sudo snap install chromium 2>/dev/null \
    || echo "[Deploy] ⚠️ Falha ao instalar Chromium — PDFs usarão fallback externo"
  for c in /usr/bin/chromium-browser /usr/bin/chromium /snap/bin/chromium; do
    if [ -x "$c" ]; then CHROME_BIN="$c"; break; fi
  done
fi
if [ -n "$CHROME_BIN" ]; then
  if ! grep -q "^CHROME_PATH=" .env; then
    echo "CHROME_PATH=$CHROME_BIN" >> .env
  fi
  echo "[Deploy] ✅ Chromium: $CHROME_BIN"
fi

# Backup
sudo cp .env "$ENV_BACKUP"
echo "[Deploy] ✅ .env preservado em $ENV_BACKUP"

# ============================================================
# 3. DIRETÓRIO DE UPLOADS
# ============================================================
echo ""
echo "[Deploy] === UPLOADS ==="
UPLOADS_PATH=$(grep '^UPLOADS_DIR=' .env | cut -d= -f2- | tr -d '\"')
UPLOADS_PATH="${UPLOADS_PATH:-$UPLOADS_DIR}"

if [ ! -d "$UPLOADS_PATH" ]; then
  sudo mkdir -p "$UPLOADS_PATH"
fi
sudo chown -R "$APP_USER:$APP_USER" "$UPLOADS_PATH" 2>/dev/null || true
sudo chmod -R 755 "$UPLOADS_PATH" 2>/dev/null || true
echo "[Deploy] ✅ $UPLOADS_PATH ($(du -sh $UPLOADS_PATH 2>/dev/null | cut -f1))"

# ============================================================
# 3b. DEPENDÊNCIAS DO SISTEMA (Chrome/Puppeteer)
# ============================================================
echo ""
echo "[Deploy] === DEPENDÊNCIAS DO CHROME ==="
echo "[Deploy] Garantindo dependências do Chrome/Puppeteer (idempotente)..."
sudo apt-get update -qq 2>/dev/null || true
sudo apt-get install -y --no-install-recommends \
  libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
  libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 \
  libxrandr2 libgbm1 libpango-1.0-0 \
  libcairo2 libnss3 libnspr4 libxss1 libxtst6 2>/dev/null || true
# libasound2 foi renomeado para libasound2t64 no Ubuntu 24
sudo apt-get install -y libasound2 2>/dev/null || sudo apt-get install -y libasound2t64 2>/dev/null || true
echo "[Deploy] ✅ Dependências do Chrome verificadas"

# Certificado de assinatura do agente RMM (não web-acessível)
CERTS_DIR="/var/www/helpdesk/certs"
sudo mkdir -p "$CERTS_DIR"
if [ -f "$APP_DIR/certs/WinnerRMM-CodeSigning.cer" ]; then
  sudo cp "$APP_DIR/certs/WinnerRMM-CodeSigning.cer" "$CERTS_DIR/"
  sudo chmod 644 "$CERTS_DIR/WinnerRMM-CodeSigning.cer"
  sudo chown root:root "$CERTS_DIR/WinnerRMM-CodeSigning.cer"
  echo "[Deploy] ✅ Certificado salvo em $CERTS_DIR/WinnerRMM-CodeSigning.cer"
fi

# ============================================================
# 4. CORREÇÕES ABACUS AI → VPS
# ============================================================
if grep -q '/home/ubuntu/winner_tecnologia_site' prisma/schema.prisma 2>/dev/null; then
  sed -i '/output.*winner_tecnologia_site/d' prisma/schema.prisma
fi

sed -i '/^NEXT_OUTPUT_MODE=/d' .env
sed -i '/^NEXT_DIST_DIR=/d' .env

if grep -q 'outputFileTracingRoot' next.config.js 2>/dev/null; then
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

echo "[Deploy] Prisma generate..."
yarn prisma generate

if [ "$DEPLOY_RUN_STATUS_MIGRATION" = "YES_I_HAVE_BACKUP" ]; then
  echo "[Deploy] Status migration explicitly enabled."
  node scripts/migrate-status-enum-to-string.js 2>&1 || echo "[Deploy] ⚠️ Migração de status falhou (verificar logs)"
else
  echo "[Deploy] DB safety: status migration skipped. Set DEPLOY_RUN_STATUS_MIGRATION=YES_I_HAVE_BACKUP to run."
fi

if [ "$DEPLOY_DB_PUSH" = "YES_I_HAVE_BACKUP" ]; then
  echo "[Deploy] Prisma db push explicitly enabled."
  if yarn prisma db push --skip-generate 2>&1; then
    echo "[Deploy] ✅ Schema sincronizado com sucesso"
  else
    echo "[Deploy] ❌ ERRO CRÍTICO: prisma db push falhou — abortando deploy!"
    echo "[Deploy] Schema do código NÃO foi aplicado ao banco."
    echo "[Deploy] Efeito: toda escrita no banco retornaria HTTP 500 se o deploy continuasse."
    echo "[Deploy] Corrija o problema, ou aplique a coluna manualmente via psql e rerun."
    exit 1
  fi
else
  echo "[Deploy] DB safety: prisma db push skipped. Set DEPLOY_DB_PUSH=YES_I_HAVE_BACKUP to run."
  # Detectar se há mudanças de schema pendentes mesmo sem DEPLOY_DB_PUSH.
  # prisma migrate diff --exit-code sai com código 2 quando há diferenças.
  # Isso evita que código com novas colunas vá ao ar sem a coluna existir no banco.
  DB_URL=$(grep '^DATABASE_URL=' .env | cut -d= -f2- | tr -d '"')
  if [ -n "$DB_URL" ]; then
    echo "[Deploy] Verificando drift entre schema.prisma e banco..."
    if npx prisma migrate diff \
        --from-url "$DB_URL" \
        --to-schema-datamodel prisma/schema.prisma \
        --exit-code \
        --script 2>/dev/null; then
      echo "[Deploy] ✅ Schema OK — banco sincronizado com schema.prisma"
    else
      DIFF_EXIT=$?
      if [ "$DIFF_EXIT" = "2" ]; then
        echo "[Deploy] ❌ ABORTANDO: schema.prisma tem colunas/tabelas pendentes que não existem no banco!"
        echo "[Deploy] Isso causaria HTTP 500 em toda escrita no banco após o deploy."
        echo "[Deploy] Para aplicar: defina DEPLOY_DB_PUSH=YES_I_HAVE_BACKUP e rerun o workflow."
        echo "[Deploy] Ou aplique manualmente via SSH: sudo -u postgres psql -d winner_helpdesk"
        exit 1
      fi
    fi
  fi
fi

if [ "$DEPLOY_RUN_SEED" = "YES_I_ACCEPT_DATA_CHANGES" ]; then
  echo "[Deploy] Seed explicitly enabled."
  npx tsx scripts/seed.ts 2>&1 || echo "[Deploy] ⚠️ Seed falhou (não-crítico)"
else
  echo "[Deploy] DB safety: seed skipped. Set DEPLOY_RUN_SEED=YES_I_ACCEPT_DATA_CHANGES to run."
fi

echo "[Deploy] Limpando .next..."
rm -rf .next

echo "[Deploy] Build..."
NODE_OPTIONS="--max-old-space-size=4096" yarn build

if [ ! -f ".next/BUILD_ID" ]; then
  echo "[Deploy] ❌ ERRO: Sem BUILD_ID!"
  exit 1
fi
echo "[Deploy] ✅ Build OK — BUILD_ID: $(cat .next/BUILD_ID)"

# Garantir ownership de .next + node_modules para ubuntu
sudo chown -R "$APP_USER:$APP_USER" .next node_modules 2>/dev/null || true

# ============================================================
# 6. PARAR APLICAÇÃO (PM2 do ubuntu + cirurgia)
# IMPORTANTE: Esta seção é desenhada para PRESERVAR o app antigo
#             se houver qualquer problema. PM2 stop/delete só
#             acontece DEPOIS de termos certeza que conseguimos liberar a porta.
# ============================================================
echo ""
echo "[Deploy] === PARANDO APLICAÇÃO (com salvaguardas) ==="

# 6a. Stop suave do PM2 (sem delete ainda)
pm2_u stop "$PM2_NAME" 2>/dev/null || true
sleep 3

# 6b. Aguarda porta liberar SEM matar processos extras ainda
PORT_FREE=false
for i in $(seq 1 5); do
  if ! is_port_busy; then
    echo "[Deploy] ✅ Porta $PORT liberada após pm2 stop (tentativa $i)"
    PORT_FREE=true
    break
  fi
  echo "[Deploy] Aguardando porta liberar suavemente ($i/5)..."
  sleep 2
done

# 6c. Se porta ainda ocupada, escalar para kill cirúrgico
if [ "$PORT_FREE" = false ]; then
  echo "[Deploy] Porta ainda ocupada — escalando para kill cirúrgico..."
  sudo pkill -9 -f "next-server" 2>/dev/null || true
  sudo pkill -9 -f "sh -c next start" 2>/dev/null || true
  sudo pkill -9 -f "yarn.*start" 2>/dev/null || true
  sudo pkill -9 -f "node .*next/dist/bin/next" 2>/dev/null || true
  sleep 2

  # Loop com early-break
  for i in $(seq 1 8); do
    if ! is_port_busy; then
      echo "[Deploy] ✅ Porta $PORT livre (tentativa $i pós-kill)"
      PORT_FREE=true
      break
    fi
    echo "[Deploy] Porta ocupada ($i/8) — kill extra..."
    sudo fuser -k -9 $PORT/tcp 2>/dev/null || true
    sudo pkill -9 -f "next-server" 2>/dev/null || true
    sleep 2
  done
fi

# 6d. Se AINDA ocupada — ABORTA SEM TOCAR no PM2 atual (preserva app)
if [ "$PORT_FREE" = false ]; then
  echo "[Deploy] ❌❌❌ ABORTANDO: Porta $PORT segue ocupada após 30s"
  echo "[Deploy] App antigo PRESERVADO (pm2_u start será executado para reativar)"
  echo ""
  echo "[Deploy] Tentando reativar app antigo..."
  pm2_u start "$PM2_NAME" 2>/dev/null || true
  sleep 5
  pm2_u list
  echo ""
  echo "=== DIAGNÓSTICO ==="
  show_port_info
  echo ""
  sudo ps -eo pid,user,comm,args 2>/dev/null | grep -E "next|yarn" | grep -v grep || true
  echo ""
  echo "[Deploy] Recuperação manual via SSH:"
  echo "  sudo pkill -9 -f next-server"
  echo "  sudo fuser -k 3000/tcp"
  echo "  cd $APP_DIR && sudo -u $APP_USER PORT=$PORT pm2 start node_modules/next/dist/bin/next --name $PM2_NAME --interpreter node -- start"
  exit 1
fi

# 6e. Porta liberada com sucesso — agora podemos fazer delete do PM2 antigo
echo "[Deploy] Removendo entrada antiga do PM2..."
pm2_u delete "$PM2_NAME" 2>/dev/null || true
sleep 2

# ============================================================
# 7. INICIAR APLICAÇÃO (binário direto, como ubuntu)
# ============================================================
echo ""
echo "[Deploy] === INICIANDO APLICAÇÃO ==="
echo "[Deploy] Memória: $(free -m 2>/dev/null | awk '/Mem/{print $4}')MB livre"
echo "[Deploy] Comando: sudo -u $APP_USER PORT=$PORT pm2 start node_modules/next/dist/bin/next --interpreter node"

# Garante que o binário existe
if [ ! -f "node_modules/next/dist/bin/next" ]; then
  echo "[Deploy] ❌ ERRO: node_modules/next/dist/bin/next não encontrado!"
  exit 1
fi

# IMPORTANTE: sudo -u ubuntu para PM2 daemon ser do ubuntu (não root)
# IMPORTANTE: --interpreter node para PM2 monitorar o processo Node real
#             (não yarn wrapper que cria filhos órfãos)
sudo -u "$APP_USER" \
  PORT=$PORT \
  NODE_ENV=production \
  PUPPETEER_EXECUTABLE_PATH='/home/ubuntu/.cache/puppeteer/chrome/linux-127.0.6533.88/chrome-linux64/chrome' \
  RUNNER_TRACKING_ID="" \
  pm2 start node_modules/next/dist/bin/next \
    --name "$PM2_NAME" \
    --interpreter node \
    --cwd "$APP_DIR" \
    --max-restarts 5 \
    --restart-delay 5000 \
    --kill-timeout 30000 \
    --time \
    -- start

echo "[Deploy] Aguardando 35s para warmup..."
sleep 35

echo "[Deploy] Status PM2 (ubuntu):"
pm2_u list

# ============================================================
# 8. HEALTH CHECK
# ============================================================
echo ""
echo "[Deploy] === HEALTH CHECK ==="
SUCCESS=false
RESTART_ATTEMPTED=false

for i in $(seq 1 24); do
  PM2_STATUS=$(pm2_u jlist 2>/dev/null | python3 -c "
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
    if [ "$RESTART_ATTEMPTED" = false ]; then
      echo "[Deploy] ⚠️ PM2 status: $PM2_STATUS — tentando restart 1x"
      pm2_u logs "$PM2_NAME" --err --nostream --lines 15 2>/dev/null || true
      pm2_u restart "$PM2_NAME" 2>/dev/null || true
      RESTART_ATTEMPTED=true
      sleep 20
      continue
    else
      echo "[Deploy] ❌ Falha persistente em PM2 — abortando health check"
      break
    fi
  fi

  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 --max-time 10 http://localhost:$PORT/login 2>/dev/null || echo "000")

  if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "302" ] || [ "$HTTP_CODE" = "307" ]; then
    echo "[Deploy] ✅ HTTP $HTTP_CODE — App respondendo (tentativa $i)!"
    SUCCESS=true
    break
  fi

  echo "[Deploy] Tentativa $i/24 — HTTP $HTTP_CODE | PM2: $PM2_STATUS"
  sleep 5
done

# ============================================================
# 9. RESULTADO
# ============================================================
echo ""
if [ "$SUCCESS" = true ]; then
  pm2_u save --force
  pm2_u list
  echo ""
  echo "[Deploy] ✅✅✅ DEPLOY v9 CONCLUÍDO COM SUCESSO ✅✅✅"
else
  echo "[Deploy] ❌❌❌ DEPLOY v9 FALHOU ❌❌❌"
  echo ""
  echo "=== DIAGNÓSTICO ==="
  pm2_u list 2>/dev/null || true
  echo ""
  echo "--- PM2 DESCRIBE ---"
  pm2_u describe "$PM2_NAME" 2>/dev/null || true
  echo ""
  echo "--- PM2 ERROR LOGS ---"
  pm2_u logs "$PM2_NAME" --err --nostream --lines 50 2>/dev/null || true
  echo ""
  echo "--- PM2 OUT LOGS ---"
  pm2_u logs "$PM2_NAME" --out --nostream --lines 30 2>/dev/null || true
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
  echo "[Deploy] Recuperação manual via SSH:"
  echo "  sudo pkill -9 -f next-server"
  echo "  sudo fuser -k 3000/tcp"
  echo "  sudo -u ubuntu pm2 delete $PM2_NAME"
  echo "  cd $APP_DIR && sudo -u ubuntu PORT=3000 pm2 start node_modules/next/dist/bin/next --name $PM2_NAME --interpreter node -- start"
  echo "  sudo -u ubuntu pm2 save --force"
fi

echo "[Deploy] === FIM v9 ==="
