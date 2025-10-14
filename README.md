# Desafio_Bonsae — README 

---

## Requisitos

* Node.js 18+ (para rodar localmente, opcional quando usando Docker)
* Docker Desktop (Windows/Mac) ou Docker Engine + Docker Compose v2
* Git (opcional)

---

## Como o README garante que o `docker compose up` suba sem problemas

* Usa **volumes nomeados** para persistência do Postgres.
* Adiciona **healthchecks** para Postgres e Redis para facilitar diagnósticos.
* Recomenda usar um script `wait-for-it` para garantir que API/Worker esperem os serviços estarem prontos.
* Inclui comandos claros para **limpeza segura** de dados corrompidos no Windows e Linux.
* Traz passos de debug (`docker compose logs -f`) e recuperação mínima (`pg_resetwal` como último recurso).

---

## Passo a passo rápido

1. Clone o repo e instale dependências (se for rodar local):

```bash
git clone https://github.com/d-dev0/Desafio_Bonsae.git
cd Desafio_Bonsae
npm install
cp .env.example .env
# edite .env conforme necessário
```

2. (Recomendado) coloque no `.env` as conexões apontando para os nomes dos serviços do Compose quando for usar Docker:

```
DB_HOST=postgres
DB_PORT=5432
REDIS_URL=redis://redis:6379
PORT=3000
JOB_CONCURRENCY=2
```

3. Suba tudo (build + rodar em background):

```bash
docker compose up --build -d
+```

4. Monitoramento:

```bash
# ver todos os logs
docker compose logs -f
# ver logs de um serviço específico
docker compose logs -f residencia_postgres
```

---

## Arquivo recomendado `docker-compose.yml`

Cole este arquivo no repositório (substitua o atual se quiser). Observação: **não** é necessário o campo `version:` com Docker Compose v2.

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
    command: ["/bin/sh", "-c", "./wait-for-it.sh postgres:5432 -- ./start-api.sh"]
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

**Notas sobre o compose acima**

* `depends_on` garante ordem de criação, mas **não** garante que o serviço esteja pronto. Por isso usamos `wait-for-it.sh` na `command` da API/Worker para aguardar a porta do Postgres/Redis responder.
* `postgres_data` é um **volume nomeado**: é mais robusto e evita problemas com permissões/selinux/NTFS quando comparado a montar pasta do host diretamente.

---

## Arquivo `wait-for-it.sh` (opcional, recomendado)

Coloque o utilitário `wait-for-it.sh` na raiz do projeto (dê permissão de execução). Ele espera por uma porta TCP antes de executar o comando final.

Exemplo mínimo (adicione ao repositório como `wait-for-it.sh`):

```bash
#!/usr/bin/env bash
# https://github.com/vishnubob/wait-for-it
# Versão reduzida — use a original caso precise de mais opções

HOSTPORT=$1
shift
CMD=()
for arg in "$@"; do
  CMD+=("$arg")
done

IFS=':' read HOST PORT <<< "${HOSTPORT}"

until nc -z "$HOST" "$PORT"; do
  echo "Waiting for $HOST:$PORT..."
  sleep 1
done

echo "$HOST:$PORT is up - executing command"
exec "${CMD[@]}"
```

No Dockerfile da API, garanta que `wait-for-it.sh` esteja copiado e `start-api.sh` exista (ou substitua `./start-api.sh` por `npm run start`).

---

## Limpeza segura (quando o Postgres está corrompido)

> **Importante:** esses passos apagam dados. Faça backup antes se necessário.

**Parar e remover containers + volumes anônimos**

```bash
docker compose down -v
```

**Windows (PowerShell) — remover pasta local postgres-data**

```powershell
# apenas se você usa pasta no host e quer remover
Remove-Item -Recurse -Force ./postgres-data
```

**Linux / macOS**

```bash
rm -rf ./postgres-data
```

**Se você usa volume nomeado (recomendado)**

```bash
docker volume ls
docker volume rm <nome_do_volume>  # ex: projeto_postgres_data
```

---

## Tratamento avançado (último recurso)

Se você precisa recuperar dados e **não pode apagar o volume**, procure restaurar de backup (`pg_dump` / `pg_basebackup`). Em último caso, `pg_resetwal` pode permitir reiniciar um cluster corrompido, mas **pode causar perda de transações**:

```bash
# ACESSAR O CONTAINER DO POSTGRES
docker compose run --rm postgres bash
# dentro do container
pg_resetwal -f /var/lib/postgresql/data
```

Use isso apenas quando entender os riscos.

---

## Debug rápido

* Logs em tempo real:

```bash
docker compose logs -f
```

* Verificar health status dos serviços:

```bash
docker compose ps
```

* Acessar um shell no container do Postgres:

```bash
docker compose exec postgres bash
# depois dentro do container
psql -U postgres -d residencia
```

---

## Testes da API (mesmas rotas de antes)

Criar job (ex.: 20k linhas):

```bash
curl -X POST http://localhost:3000/reports \
  -H "Content-Type: application/json" \
  -d '{"rows":20000, "columns":12, "title":"Relatório Bonsae"}'
```