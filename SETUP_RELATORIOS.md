# 🚀 Setup - Sistema de Relatórios Salvos

## Passo a Passo para Ativar o Sistema

### 1️⃣ Criar a Tabela no Banco de Dados

Você precisa executar a migration SQL para criar a tabela `relatorios_salvos`.

#### Opção A: Via linha de comando (PostgreSQL instalado)

```bash
# Windows
psql -U postgres -d residencia -f migrations\001_create_relatorios_table.sql

# Linux/Mac
psql -U postgres -d residencia -f migrations/001_create_relatorios_table.sql
```

#### Opção B: Via Docker (se usando Docker)

```bash
# Copiar arquivo para container
docker cp migrations/001_create_relatorios_table.sql residencia_postgres:/tmp/

# Executar dentro do container
docker exec -it residencia_postgres psql -U postgres -d residencia -f /tmp/001_create_relatorios_table.sql
```

#### Opção C: Via pgAdmin ou outro cliente

1. Abra o arquivo `migrations/001_create_relatorios_table.sql`
2. Copie todo o conteúdo
3. Execute no seu cliente PostgreSQL conectado ao banco `residencia`

---

### 2️⃣ Verificar se a Tabela foi Criada

```sql
-- Conectar ao banco
psql -U postgres -d residencia

-- Verificar estrutura da tabela
\d relatorios_salvos

-- Deve mostrar:
--   id, nome, tipo, arquivo_nome, arquivo_path, tamanho_bytes,
--   filtros, estatisticas, criado_em, criado_por, downloads, ultimo_download
```

---

### 3️⃣ Testar o Sistema

#### Iniciar o servidor

```bash
npm run dev
# ou
npm start
```

#### Executar testes automáticos

**Windows (PowerShell):**
```powershell
.\test-relatorios.ps1
```

**Linux/Mac (Bash):**
```bash
chmod +x test-relatorios.sh
./test-relatorios.sh
```

---

### 4️⃣ Usar a API

#### Gerar um relatório Excel (salva automaticamente)

```bash
curl "http://localhost:3000/download/excel?turma_id=1" -o relatorio.xlsx
```

#### Listar relatórios salvos

```bash
curl http://localhost:3000/relatorios/salvos
```

#### Baixar um relatório salvo

```bash
curl -OJ http://localhost:3000/relatorios/salvos/1/download
```

---

## 🔍 Verificações Importantes

### ✅ Checklist de Instalação

- [ ] Tabela `relatorios_salvos` criada no banco
- [ ] Pasta `storage` existe (criada automaticamente)
- [ ] Servidor rodando sem erros
- [ ] Consegue gerar relatórios Excel e PDF
- [ ] Consegue listar relatórios salvos
- [ ] Consegue baixar relatórios salvos

### 🧪 Teste Rápido

```bash
# 1. Gerar relatório
curl "http://localhost:3000/download/excel?turma_id=1" -o test.xlsx

# 2. Verificar se foi salvo no banco
curl http://localhost:3000/relatorios/salvos

# 3. Verificar pasta storage
ls storage/
# ou no Windows: dir storage\
```

---

## 🐛 Problemas Comuns

### Erro: "relation relatorios_salvos does not exist"

**Solução:** Execute a migration SQL (passo 1)

```bash
psql -U postgres -d residencia -f migrations/001_create_relatorios_table.sql
```

---

### Erro: "cannot open file for writing"

**Solução:** Verifique permissões da pasta storage

```bash
# Linux/Mac
chmod 755 storage

# Windows (PowerShell como Admin)
icacls storage /grant Everyone:F
```

---

### Erro: "ENOENT: no such file or directory, stat './storage'"

**Solução:** Criar pasta storage manualmente

```bash
mkdir storage
```

---

### Servidor não inicia

**Solução:** Verificar se PostgreSQL está rodando

```bash
# Verificar conexão
psql -U postgres -d residencia -c "SELECT 1"

# Se estiver usando Docker
docker ps | grep postgres
```

---

## 📊 Consultas SQL Úteis

### Ver todos os relatórios

```sql
SELECT id, nome, tipo, tamanho_bytes, criado_em, downloads 
FROM relatorios_salvos 
ORDER BY criado_em DESC;
```

### Ver estatísticas gerais

```sql
SELECT 
  tipo,
  COUNT(*) as total,
  SUM(downloads) as total_downloads,
  ROUND(SUM(tamanho_bytes)::numeric / 1024 / 1024, 2) as total_mb
FROM relatorios_salvos
GROUP BY tipo;
```

### Relatórios mais baixados

```sql
SELECT id, nome, tipo, downloads, criado_em
FROM relatorios_salvos
ORDER BY downloads DESC
LIMIT 10;
```

### Limpar relatórios antigos (mais de 30 dias)

```sql
DELETE FROM relatorios_salvos 
WHERE criado_em < NOW() - INTERVAL '30 days';
```

---

## 🎯 Próximos Passos

Após o setup:

1. ✅ Leia a documentação completa: `RELATORIOS_SALVOS.md`
2. ✅ Acesse o Swagger: `http://localhost:3000/docs`
3. ✅ Teste todas as rotas da API
4. ✅ Configure limpeza automática de arquivos antigos (opcional)

---

## 📞 Suporte

Se encontrar problemas:

1. Verifique os logs do servidor
2. Verifique conexão com PostgreSQL
3. Verifique permissões da pasta storage
4. Verifique se a tabela foi criada corretamente

---

## ✨ Funcionalidades Disponíveis

Após o setup, você terá:

- ✅ Salvamento automático de todos os relatórios
- ✅ Histórico completo com metadados
- ✅ Reutilização de relatórios (sem regenerar)
- ✅ Estatísticas de uso
- ✅ API RESTful completa
- ✅ Documentação Swagger
