# Report Service — Geração Assíncrona de Relatórios (Node.js + BullMQ + Redis + ExcelJS)

## 🚀 Pré-requisitos
- Node.js 18+ (se for rodar localmente)
- Docker Desktop (ou Docker Engine + Docker Compose)

---

## 🔧 Configuração inicial

Clone o repositório e entre no diretório:

```bash
git clone https://github.com/d-dev0/Desafio_Bonsae.git
cd Desafio_Bonsae


Instale dependências e configure variáveis de ambiente:

npm install
cp .env.example .env


Edite o arquivo .env conforme necessário (porta da API, conexão Redis, concorrência de jobs etc.).

🟢 Rodando localmente
1) Subir o Redis
docker compose up -d redis

2) Iniciar a API e o Worker (em dois terminais separados)
# terminal 1
npm run start   # inicia a API (porta definida no .env, ex.: 3000)

# terminal 2
npm run worker  # inicia o worker que processa os relatórios

🐳 Rodando com Docker Compose (API + Worker + Redis)

Se o projeto já possui docker-compose.yml, basta:

docker compose up --build


Isso vai levantar:

API (porta mapeada no .env → padrão 3000)

Worker (processamento assíncrono)

Redis (fila de jobs)

🔍 Testes rápidos
Criar job (20k linhas)
curl -X POST http://localhost:3000/reports \
  -H "Content-Type: application/json" \
  -d '{"rows": 20000, "columns": 12, "title": "Relatório Bonsae"}'


Resposta esperada:

{
  "jobId": "123",
  "statusUrl": "http://localhost:3000/reports/123",
  "downloadUrl": "http://localhost:3000/reports/123/download"
}

Consultar status
curl http://localhost:3000/reports/123

Baixar relatório pronto
curl -OJ http://localhost:3000/reports/123/download

⚡ Observações de performance

ExcelJS (modo streaming) → suporta 100k+ linhas sem estourar memória.

Ajuste JOB_CONCURRENCY no .env de acordo com CPU/RAM.

Retentativas e backoff configuráveis no BullMQ.