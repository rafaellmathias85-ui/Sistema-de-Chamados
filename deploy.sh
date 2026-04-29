#!/bin/bash
# ============================================================
# deploy.sh — Build & Restart na VPS Hostinger
# Chamado pelo GitHub Actions após git pull
# ============================================================
set -e

APP_DIR="/var/www/helpdesk/app"
cd "$APP_DIR"

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

echo "[Deploy] Executando build..."
yarn build

echo "[Deploy] Reiniciando aplicação..."
if command -v pm2 &> /dev/null; then
  # Tenta os nomes comuns do processo PM2
  pm2 restart winner-helpdesk 2>/dev/null \
    || pm2 restart helpdesk 2>/dev/null \
    || pm2 restart all 2>/dev/null \
    || pm2 start yarn --name winner-helpdesk -- start
  pm2 save 2>/dev/null
else
  echo "[Deploy] PM2 não encontrado. Tentando systemctl..."
  sudo systemctl restart helpdesk 2>/dev/null || echo "[Deploy] AVISO: Não foi possível reiniciar o serviço automaticamente."
fi

echo "[Deploy] === DEPLOY CONCLUÍDO ==="
