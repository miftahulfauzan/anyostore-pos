# 15. Deployment

## 15.1 Docker Setup

### Dockerfile Backend

```dockerfile
# backend/Dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY src ./src

EXPOSE 3001

CMD ["node", "src/index.js"]
```

### Dockerfile Frontend

```dockerfile
# frontend/Dockerfile
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# next.config.js must include: module.exports = { output: 'standalone' }
RUN npm run build

FROM node:18-alpine AS runner
WORKDIR /app
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/public ./public

EXPOSE 3000

CMD ["node", "server.js"]
```

### docker-compose.yml

```yaml
version: '3.8'

services:
  db:
    image: mysql:8
    environment:
      MYSQL_ROOT_PASSWORD: rootpassword
      MYSQL_DATABASE: pos_pakaian
    ports:
      - "3306:3306"
    volumes:
      - mysql_data:/var/lib/mysql
      - ./docs/12-migration.sql:/docker-entrypoint-initdb.d/init.sql

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    ports:
      - "3001:3001"
    environment:
      NODE_ENV: production
      DB_HOST: db
      DB_PORT: 3306
      DB_USER: root
      DB_PASSWORD: rootpassword
      DB_NAME: pos_pakaian
      JWT_SECRET: ${JWT_SECRET}
      JWT_REFRESH_SECRET: ${JWT_REFRESH_SECRET}
      REDIS_URL: redis://redis:6379
    depends_on:
      - db
      - redis

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      NEXT_PUBLIC_API_URL: /api

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./docker/nginx/nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - frontend
      - backend

volumes:
  mysql_data:
```

> **Catatan:** File `.env` untuk production jangan di-commit ke git. Gunakan `.env.example` sebagai template dan isi nilai asli via environment variables CI/CD atau secrets manager. `JWT_SECRET` dan `JWT_REFRESH_SECRET` **wajib** di-generate acak (misal `openssl rand -base64 32`) dan berbeda untuk setiap environment.

> **Migration:** bind mount `init.sql` hanya dijalankan MySQL pada volume baru. Jangan gunakan sebagai mekanisme upgrade produksi. Simpan migration versi-berurutan di `backend/migrations/`, jalankan oleh migration runner pada deploy, dan backup database sebelum migration.

## 15.2 Production Server Setup (Ubuntu 22.04)

```bash
# 1. Update system
sudo apt update && sudo apt upgrade -y

# 2. Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# 3. Install Docker Compose
sudo apt install docker-compose-plugin -y

# 4. Clone repo
git clone https://github.com/your-repo/pos-pakaian.git
cd pos-pakaian

# 5. Start services
docker compose up -d

# 6. Check status
docker compose ps
docker compose logs -f
```

## 15.3 Nginx Configuration

```nginx
# docker/nginx/nginx.conf
events {
    worker_connections 1024;
}

http {
    upstream frontend {
        server frontend:3000;
    }

    upstream backend {
        server backend:3001;
    }

    server {
        listen 80;
        server_name yourdomain.com;
        return 301 https://$host$request_uri;
    }

    server {
        listen 443 ssl http2;
        server_name yourdomain.com;

        ssl_certificate /etc/nginx/ssl/cert.pem;
        ssl_certificate_key /etc/nginx/ssl/key.pem;

        location / {
            proxy_pass http://frontend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_cache_bypass $http_upgrade;
        }

        location /api {
            proxy_pass http://backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_cache_bypass $http_upgrade;
        }
    }
}
```

## 15.4 SSL with Let's Encrypt

```bash
# Install Certbot
sudo apt install certbot -y

# Get certificate
sudo certbot certonly --standalone -d yourdomain.com

# Copy certs
sudo cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem ./ssl/cert.pem
sudo cp /etc/letsencrypt/live/yourdomain.com/privkey.pem ./ssl/key.pem

# Auto-renew
sudo crontab -e
# Add: 0 12 * * * /usr/bin/certbot renew --quiet
```

## 15.5 CI/CD with GitHub Actions

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 18
      - run: cd backend && npm ci
      - run: cd backend && npm test
      - run: cd frontend && npm ci
      - run: cd frontend && npm test
      - uses: subosito/flutter-action@v2
        with:
          flutter-version: '3.22.x'
      - run: cd mobile && flutter pub get
      - run: cd mobile && flutter test

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to server
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.SERVER_HOST }}
          username: ${{ secrets.SERVER_USER }}
          key: ${{ secrets.SERVER_KEY }}
          script: |
            cd /opt/pos-pakaian
            git pull
            docker compose up -d --build
```

## 15.6 Backup Strategy

```bash
#!/bin/bash
# scripts/backup.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups"
DB_NAME="pos_pakaian"

# Database backup
mysqldump -u root -p$DB_PASSWORD $DB_NAME | gzip > $BACKUP_DIR/db_$DATE.sql.gz

# Upload to S3
aws s3 cp $BACKUP_DIR/db_$DATE.sql.gz s3://your-bucket/backups/

# Keep only last 30 days
find $BACKUP_DIR -name "*.gz" -mtime +30 -delete
```

```bash
# Cron job: daily at 2 AM
0 2 * * * /opt/pos-pakaian/scripts/backup.sh
```

## 15.7 PM2 Process Manager (Alternatif tanpa Docker)

> PM2 cocok untuk VPS kecil yang tidak pakai Docker. Jika sudah pakai Docker (15.1), skip section ini.

**Langkah tambahan untuk PM2 path — jalankan migration manual:**

```bash
# Setelah clone repo dan npm install
mysql -u root -p pos_pakaian < docs/12-migration.sql
```

```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'pos-backend',
    script: 'src/index.js',
    instances: 2,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    max_memory_restart: '500M'
  }]
};
```

## 15.8 Monitoring

```bash
# Install PM2
npm install -g pm2

# Start with PM2
pm2 start ecosystem.config.js

# Monitor
pm2 monit

# Logs
pm2 logs
```

## 15.9 Rollback Procedure

```bash
# 1. Check current version
docker compose ps

# 2. Rollback to previous version
git checkout HEAD~1
docker compose up -d --build

# 3. Or rollback database (verify in a staging database first)
gunzip -c /backups/db_20260708.sql.gz | mysql -u root -p pos_pakaian
```
