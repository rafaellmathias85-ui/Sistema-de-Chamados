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
  echo "[Deploy] Processos PM2 antes:"
  pm2 list
  pm2 describe winner-helpdesk 2>/dev/null | grep -E "(cwd|script|exec_mode)" || true
  pm2 describe helpdesk 2>/dev/null | grep -E "(cwd|script|exec_mode)" || true
  
  # Parar e deletar processos antigos
  pm2 delete winner-helpdesk 2>/dev/null || true
  pm2 delete helpdesk 2>/dev/null || true
  
  # Recriar com diretório correto
  cd "$APP_DIR"
  pm2 start yarn --name winner-helpdesk --cwd "$APP_DIR" -- start
  pm2 save
  
  echo "[Deploy] Processos PM2 após restart:"
  pm2 list
else
  echo "[Deploy] PM2 não encontrado. Tentando systemctl..."
  sudo systemctl restart helpdesk 2>/dev/null || echo "[Deploy] AVISO: Não foi possível reiniciar."
fi

echo "[Deploy] === DEPLOY CONCLUÍDO ==="
