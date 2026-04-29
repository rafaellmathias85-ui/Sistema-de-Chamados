# 🚀 Guia Completo de Hospedagem - Winner Tecnologia Helpdesk

## 📋 Requisitos da Hospedagem

### Requisitos Mínimos do Servidor
- **Sistema Operacional:** Ubuntu 20.04+ ou Debian 11+
- **RAM:** Mínimo 2GB (recomendado 4GB)
- **CPU:** 2 vCPUs
- **Disco:** 20GB SSD
- **Node.js:** Versão 18.x ou 20.x
- **Banco de Dados:** PostgreSQL 14+

### Portas Necessárias
- **80** (HTTP)
- **443** (HTTPS)
- **3000** (Next.js - interno)
- **5432** (PostgreSQL - interno)

---

## 🔧 PASSO 1: Preparar o Servidor

### 1.1 Conectar ao servidor via SSH
```bash
ssh usuario@seu-servidor.com
```

### 1.2 Atualizar o sistema
```bash
sudo apt update && sudo apt upgrade -y
```

### 1.3 Instalar Node.js 20.x
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node --version  # Deve mostrar v20.x.x
npm --version
```

### 1.4 Instalar Yarn
```bash
sudo npm install -g yarn
yarn --version
```

### 1.5 Instalar PM2 (gerenciador de processos)
```bash
sudo npm install -g pm2
```

### 1.6 Instalar Nginx (servidor web)
```bash
sudo apt install -y nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

### 1.7 Instalar PostgreSQL
```bash
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable postgresql
sudo systemctl start postgresql
```

---

## 🗄️ PASSO 2: Configurar o Banco de Dados

### 2.1 Acessar o PostgreSQL
```bash
sudo -u postgres psql
```

### 2.2 Criar usuário e banco de dados
```sql
CREATE USER winner_user WITH PASSWORD 'SuaSenhaSegura123!';
CREATE DATABASE winner_helpdesk OWNER winner_user;
GRANT ALL PRIVILEGES ON DATABASE winner_helpdesk TO winner_user;
\q
```

### 2.3 Testar conexão
```bash
psql -h localhost -U winner_user -d winner_helpdesk
# Digite a senha quando solicitado
\q
```

---

## 📁 PASSO 3: Extrair e Configurar os Arquivos

### 3.1 Criar diretório da aplicação
```bash
sudo mkdir -p /var/www/winner-helpdesk
sudo chown $USER:$USER /var/www/winner-helpdesk
cd /var/www/winner-helpdesk
```

### 3.2 Fazer upload do arquivo ZIP
Você pode usar SCP, SFTP ou FileZilla:
```bash
# Do seu computador local:
scp winner_helpdesk_completo.zip usuario@seu-servidor.com:/var/www/winner-helpdesk/
```

### 3.3 Extrair os arquivos
```bash
cd /var/www/winner-helpdesk
unzip winner_helpdesk_completo.zip
ls -la  # Verificar se os arquivos foram extraídos
```

---

## ⚙️ PASSO 4: Configurar Variáveis de Ambiente

### 4.1 Criar arquivo .env
```bash
cd /var/www/winner-helpdesk
cp .env.example .env
nano .env
```

### 4.2 Editar o arquivo .env
```env
# Banco de Dados PostgreSQL
DATABASE_URL="postgresql://winner_user:SuaSenhaSegura123!@localhost:5432/winner_helpdesk"

# NextAuth.js - IMPORTANTE: Gerar uma chave secreta única
# Gere com: openssl rand -base64 32
NEXTAUTH_SECRET="cole_aqui_sua_chave_secreta_gerada"
NEXTAUTH_URL="https://seu-dominio.com.br"

# AWS S3 (opcional - para anexos)
# Deixe vazio se não for usar anexos
AWS_BUCKET_NAME=""
AWS_FOLDER_PREFIX=""
AWS_REGION=""
AWS_ACCESS_KEY_ID=""
AWS_SECRET_ACCESS_KEY=""
```

### 4.3 Gerar NEXTAUTH_SECRET
```bash
openssl rand -base64 32
# Copie o resultado e cole no .env
```

---

## 📦 PASSO 5: Instalar Dependências e Build

### 5.1 Instalar dependências
```bash
cd /var/www/winner-helpdesk
yarn install
```

### 5.2 Gerar cliente Prisma
```bash
yarn prisma generate
```

### 5.3 Executar migrações do banco
```bash
yarn prisma db push
```

### 5.4 Popular dados iniciais (seed)
```bash
yarn prisma db seed
```

### 5.5 Fazer build da aplicação
```bash
yarn build
```

---

## 🚀 PASSO 6: Iniciar a Aplicação com PM2

### 6.1 Criar arquivo de configuração PM2
```bash
cat > ecosystem.config.js << 'PMEOF'
module.exports = {
  apps: [{
    name: 'winner-helpdesk',
    script: 'yarn',
    args: 'start',
    cwd: '/var/www/winner-helpdesk',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
}
PMEOF
```

### 6.2 Iniciar aplicação
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # Seguir instruções exibidas
```

### 6.3 Verificar status
```bash
pm2 status
pm2 logs winner-helpdesk
```

---

## 🌐 PASSO 7: Configurar Nginx (Proxy Reverso)

### 7.1 Criar configuração do site
```bash
sudo nano /etc/nginx/sites-available/winner-helpdesk
```

### 7.2 Colar a configuração
```nginx
server {
    listen 80;
    server_name seu-dominio.com.br www.seu-dominio.com.br;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
    }

    # Upload de arquivos grandes (até 50MB)
    client_max_body_size 50M;
}
```

### 7.3 Ativar o site
```bash
sudo ln -s /etc/nginx/sites-available/winner-helpdesk /etc/nginx/sites-enabled/
sudo nginx -t  # Testar configuração
sudo systemctl reload nginx
```

---

## 🔒 PASSO 8: Configurar SSL (HTTPS) com Let's Encrypt

### 8.1 Instalar Certbot
```bash
sudo apt install -y certbot python3-certbot-nginx
```

### 8.2 Obter certificado SSL
```bash
sudo certbot --nginx -d seu-dominio.com.br -d www.seu-dominio.com.br
```

### 8.3 Renovação automática (já configurada)
```bash
sudo certbot renew --dry-run  # Testar renovação
```

---

## ✅ PASSO 9: Testar a Aplicação

### 9.1 Acessar o sistema
Abra no navegador: `https://seu-dominio.com.br`

### 9.2 Credenciais padrão
| Perfil | Email | Senha |
|--------|-------|-------|
| Admin | admin@winner.com.br | Winner@2024 |
| Suporte | suporte@winner.com.br | Suporte@2024 |
| Cliente | cliente@cliente.com.br | Cliente@2024 |

### 9.3 Verificar páginas
- **Site:** `https://seu-dominio.com.br`
- **Login:** `https://seu-dominio.com.br/login`
- **Painel:** `https://seu-dominio.com.br/tickets`

---

## 🔧 PASSO 10: Configurações Pós-Instalação

### 10.1 Alterar senhas padrão
Após o primeiro login como admin, altere todas as senhas padrão.

### 10.2 Configurar Email (SMTP)
1. Faça login como admin
2. Acesse: Menu → Config. Email
3. Configure os dados SMTP do seu servidor de email

### 10.3 Configurar IMAP (Leitura automática de emails)
Na mesma página de Config. Email, configure o IMAP se desejar criar chamados automaticamente a partir de emails recebidos.

**Importante para Microsoft 365:**
- O IMAP deve estar habilitado no admin do M365
- A política de autenticação básica deve permitir IMAP
- Pode levar até 24h para propagar as configurações

---

## 🛠️ Comandos Úteis

### Reiniciar aplicação
```bash
pm2 restart winner-helpdesk
```

### Ver logs
```bash
pm2 logs winner-helpdesk --lines 100
```

### Atualizar aplicação
```bash
cd /var/www/winner-helpdesk
pm2 stop winner-helpdesk
git pull  # ou reenviar arquivos
yarn install
yarn prisma generate
yarn prisma db push
yarn build
pm2 start winner-helpdesk
```

### Backup do banco
```bash
pg_dump -U winner_user -h localhost winner_helpdesk > backup_$(date +%Y%m%d).sql
```

### Restaurar backup
```bash
psql -U winner_user -h localhost winner_helpdesk < backup_20260302.sql
```

---

## ❓ Solução de Problemas

### Erro de conexão com banco
- Verificar se PostgreSQL está rodando: `sudo systemctl status postgresql`
- Verificar credenciais no .env

### Erro 502 Bad Gateway
- Verificar se aplicação está rodando: `pm2 status`
- Ver logs: `pm2 logs winner-helpdesk`

### Erro de permissão
```bash
sudo chown -R $USER:$USER /var/www/winner-helpdesk
```

### Aplicação não inicia
```bash
cd /var/www/winner-helpdesk
yarn build  # Verificar erros de build
pm2 logs    # Ver logs de erro
```

---

## 📞 Suporte

Em caso de dúvidas sobre a hospedagem ou configuração, entre em contato com o suporte técnico.

---

*Documento atualizado em: Março 2026*
