#!/bin/bash
# ============================================================
# deploy.sh — Build & Restart na VPS Hostinger
# Chamado pelo GitHub Actions após git pull
# ============================================================
set -e

APP_DIR="/var/www/helpdesk/app"
cd "$APP_DIR"

echo "[Deploy] Instalando dependências..."
yarn install --frozen-lockfile 2>/dev/null || yarn install

echo "[Deploy] Gerando Prisma Client..."
yarn prisma generate

echo "[Deploy] Executando build..."
yarn build

echo "[Deploy] Reiniciando aplicação..."
if command -v pm2 &> /dev/null; then
  pm2 restart helpdesk 2>/dev/null || pm2 start yarn --name helpdesk -- start
else
  echo "[Deploy] PM2 não encontrado. Tentando systemctl..."
  sudo systemctl restart helpdesk 2>/dev/null || echo "[Deploy] AVISO: Não foi possível reiniciar o serviço automaticamente."
fi

echo "[Deploy] === DEPLOY CONCLUÍDO ==="
