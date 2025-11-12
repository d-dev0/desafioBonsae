# 📊 Desafio Bonsae — Geração de Relatórios com Node.js, Redis e PostgreSQL

> Repositório oficial do desafio Bonsae — projeto que gera relatórios de grande volume usando **Node.js**, **Redis** e **PostgreSQL**, com suporte completo a **Docker Compose**.

---

## 🚀 Tecnologias

* **Node.js 18+** — API e worker para geração de relatórios (ExcelJS)
* **Redis 7** — gerenciamento de filas (BullMQ)
* **PostgreSQL 15** — armazenamento de dados
* **Docker Compose** — orquestração completa dos serviços

---

## ⚙️ Requisitos

Antes de iniciar, garanta que você possui:

* [Docker Desktop](https://www.docker.com/products/docker-desktop/) (ou Docker Engine + Docker Compose v2)
* [Git](https://git-scm.com/downloads)
* (Opcional) [Node.js 18+](https://nodejs.org/) caso queira rodar localmente sem Docker

---

## 🧩 Instalação e Configuração

1️⃣ Clone o repositório e entre na pasta:

```bash
git clone https://github.com/d-dev0/Desafio_Bonsae.git
cd Desafio_Bonsae
```

2️⃣ Instale dependências (opcional se for rodar via Docker):

```bash
npm install
```

3️⃣ Crie o arquivo `.env` baseado no exemplo:

```bash
cp .env.example .env
```

4️⃣ Ajuste o `.env` conforme necessário (valores padrão abaixo):

```env
DB_HOST=postgres
DB_PORT=5432
REDIS_URL=redis://redis:6379
PORT=3000
JOB_CONCURRENCY=2
```

---

## 🐳 Rodando com Docker Compose

Suba todos os serviços (API, Worker, Redis e Postgres):

```bash
docker compose up --build -d
```

### 🔍 Ver logs

```bash
docker compose logs -f
```

### 🧼 Parar e limpar tudo (inclusive volumes)

```bash
docker compose down -v
```

---

## 🧱 Estrutura recomendada do `docker-compose.yml`

```yaml
services:
  postgres:
    image: postgres:15
    container_name: residencia_postgres
    restart: always
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: residencia
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7
    container_name: residencia_redis
    restart: always
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  api:
    build: .
    container_name: residencia_api
    restart: on-failure
    depends_on:
      - postgres
      - redis
    environment:
      - NODE_ENV=production
      - DB_HOST=postgres
      - REDIS_URL=redis://redis:6379
    ports:
      - "3000:3000"
    command: ["/bin/sh", "-c", "./wait-for-it.sh postgres:5432 -- npm run start"]
    volumes:
      - ./:/usr/src/app

  worker:
    build: .
    container_name: residencia_worker
    restart: on-failure
    depends_on:
      - postgres
      - redis
    environment:
      - NODE_ENV=production
      - DB_HOST=postgres
      - REDIS_URL=redis://redis:6379
    command: ["/bin/sh", "-c", "./wait-for-it.sh redis:6379 -- npm run worker"]
    volumes:
      - ./:/usr/src/app

volumes:
  postgres_data:
    driver: local
```

> 💡 **Dica:** o uso de volume nomeado (`postgres_data`) evita problemas de permissões comuns no Windows e mantém os dados persistentes.

---

## 🕒 Script `wait-for-it.sh`

Esse script faz com que a API e o Worker aguardem o banco e o Redis ficarem prontos antes de iniciar.

Crie um arquivo `wait-for-it.sh` na raiz do projeto com o conteúdo abaixo e dê permissão de execução (`chmod +x wait-for-it.sh`):

```bash
#!/usr/bin/env bash
HOSTPORT=$1
shift
CMD=()
for arg in "$@"; do
  CMD+=("$arg")
done
IFS=':' read HOST PORT <<< "${HOSTPORT}"
until nc -z "$HOST" "$PORT"; do
  echo "Aguardando $HOST:$PORT..."
  sleep 1
done
echo "$HOST:$PORT está disponível — executando comando"
exec "${CMD[@]}"
```

---

## 🧹 Corrigindo erro de banco corrompido

Se aparecer o erro:

```
PANIC: could not locate a valid checkpoint record
```

Execute:

```bash
docker compose down -v
```

E se estiver usando pastas locais:

**Windows (PowerShell)**

```powershell
Remove-Item -Recurse -Force .\postgres-data
```

**Linux/Mac:**

```bash
rm -rf ./postgres-data
```

---

## 🧪 Testando a API

Crie um job de geração de relatório (exemplo: 20.000 linhas):

```bash
curl -X POST http://localhost:3000/reports \
  -H "Content-Type: application/json" \
  -d '{"rows":20000, "columns":12, "title":"Relatório Bonsae"}'
```

Exemplo de resposta:

```json
{
  "jobId": "123",
  "statusUrl": "http://localhost:3000/reports/123",
  "downloadUrl": "http://localhost:3000/reports/123/download"
}
```

Consultar status:

```bash
curl http://localhost:3000/reports/123
```

Baixar relatório pronto:

```bash
curl -OJ http://localhost:3000/reports/123/download
```

---

## 🧭 Troubleshooting

* Veja logs em tempo real:

  ```bash
  docker compose logs -f
  ```
* Cheque o status dos serviços:

  ```bash
  docker compose ps
  ```
* Acesse o banco:

  ```bash
  docker compose exec postgres psql -U postgres -d residencia
  ```
