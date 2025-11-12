# 💾 Sistema de Relatórios Salvos

## Visão Geral

O sistema agora armazena automaticamente todos os relatórios gerados (Excel e PDF) no banco de dados PostgreSQL, permitindo:

- **Reutilização** de relatórios já gerados
- **Histórico** de todos os relatórios criados
- **Estatísticas** de uso (número de downloads)
- **Gerenciamento** centralizado de arquivos

---

## 🗄️ Estrutura do Banco de Dados

### Tabela: `relatorios_salvos`

```sql
CREATE TABLE relatorios_salvos (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(255) NOT NULL,
  tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('excel', 'pdf')),
  arquivo_nome VARCHAR(255) NOT NULL,
  arquivo_path TEXT NOT NULL,
  tamanho_bytes BIGINT,
  filtros JSONB,
  estatisticas JSONB,
  criado_em TIMESTAMP DEFAULT NOW(),
  criado_por VARCHAR(100),
  downloads INTEGER DEFAULT 0,
  ultimo_download TIMESTAMP
);
```

**Para criar a tabela, execute:**

```bash
psql -U postgres -d residencia -f migrations/001_create_relatorios_table.sql
```

---

## 🚀 Novas Rotas da API

### 1. Listar Relatórios Salvos

**GET** `/relatorios/salvos`

Lista todos os relatórios salvos no banco de dados.

**Query Parameters:**
- `tipo` (opcional): Filtrar por tipo (`excel` ou `pdf`)
- `limite` (opcional): Limitar número de resultados

**Exemplo:**
```bash
curl http://localhost:3000/relatorios/salvos?tipo=excel&limite=10
```

**Resposta:**
```json
{
  "total": 2,
  "relatorios": [
    {
      "id": 1,
      "nome": "Relatório Excel - 29/10/2025 17:30:45",
      "tipo": "excel",
      "arquivo_nome": "relatorio-1730234445123.xlsx",
      "tamanho_mb": "0.05",
      "filtros": { "turma_id": "1" },
      "estatisticas": {
        "totalAlunos": 10,
        "totalAtividades": 50,
        "mediaNotas": 7.5,
        "frequencia": 85.2
      },
      "criado_em": "2025-10-29T20:30:45.123Z",
      "criado_por": "system",
      "downloads": 3,
      "ultimo_download": "2025-10-29T21:15:30.456Z",
      "url_download": "http://localhost:3000/relatorios/salvos/1/download"
    }
  ]
}
```

---

### 2. Buscar Relatório Específico

**GET** `/relatorios/salvos/:id`

Retorna detalhes de um relatório específico.

**Exemplo:**
```bash
curl http://localhost:3000/relatorios/salvos/1
```

---

### 3. Download de Relatório Salvo

**GET** `/relatorios/salvos/:id/download`

Faz download de um relatório já gerado.

**Características:**
- ✅ Não regenera o arquivo (download instantâneo)
- ✅ Registra estatísticas de download
- ✅ Incrementa contador automaticamente

**Exemplo:**
```bash
curl -OJ http://localhost:3000/relatorios/salvos/1/download
```

---

### 4. Remover Relatório

**DELETE** `/relatorios/salvos/:id`

Remove um relatório do banco de dados e do disco.

**Exemplo:**
```bash
curl -X DELETE http://localhost:3000/relatorios/salvos/1
```

**Resposta:**
```json
{
  "success": true,
  "message": "Relatório removido com sucesso",
  "id": 1
}
```

---

## 🔄 Comportamento Automático

### Geração de Relatórios

Quando você usa as rotas existentes, o sistema agora:

1. **Gera o arquivo** (Excel ou PDF)
2. **Salva no disco** (pasta `./storage`)
3. **Registra no banco** com metadados completos
4. **Retorna para download** imediatamente

**Rotas que salvam automaticamente:**
- `GET /download/excel` - Gera e salva Excel
- `GET /download/pdf` - Gera e salva PDF

---

## 📊 Informações Armazenadas

Para cada relatório salvo:

| Campo | Descrição |
|-------|-----------|
| **nome** | Nome descritivo com timestamp |
| **tipo** | `excel` ou `pdf` |
| **arquivo_nome** | Nome do arquivo no disco |
| **arquivo_path** | Caminho completo no sistema |
| **tamanho_bytes** | Tamanho do arquivo |
| **filtros** | JSON com filtros aplicados (turma, professor, etc) |
| **estatisticas** | JSON com estatísticas do relatório |
| **downloads** | Contador de downloads |
| **ultimo_download** | Timestamp do último download |

---

## 🧪 Testando o Sistema

### 1. Gerar um relatório Excel
```bash
curl "http://localhost:3000/download/excel?turma_id=1" -o relatorio.xlsx
```

### 2. Listar relatórios salvos
```bash
curl http://localhost:3000/relatorios/salvos
```

### 3. Baixar relatório novamente pelo ID
```bash
curl -OJ http://localhost:3000/relatorios/salvos/1/download
```

### 4. Ver detalhes de um relatório
```bash
curl http://localhost:3000/relatorios/salvos/1
```

### 5. Remover um relatório
```bash
curl -X DELETE http://localhost:3000/relatorios/salvos/1
```

---

## 🔍 Vantagens do Sistema

✅ **Performance**: Relatórios idênticos não precisam ser regenerados  
✅ **Histórico**: Mantém registro de todos os relatórios criados  
✅ **Análise**: Estatísticas de uso por relatório  
✅ **Economia**: Reutilização de arquivos já gerados  
✅ **Rastreabilidade**: Sabe quais filtros foram usados em cada relatório  
✅ **Gestão**: Fácil limpeza de relatórios antigos

---

## 🛠️ Manutenção

### Limpar relatórios antigos

Você pode criar um script para remover relatórios com mais de X dias:

```sql
-- Relatórios com mais de 30 dias
DELETE FROM relatorios_salvos 
WHERE criado_em < NOW() - INTERVAL '30 days';
```

### Verificar espaço usado

```sql
SELECT 
  tipo,
  COUNT(*) as total,
  ROUND(SUM(tamanho_bytes)::numeric / 1024 / 1024, 2) as total_mb
FROM relatorios_salvos
GROUP BY tipo;
```

---

## 📝 Próximos Passos

Possíveis melhorias futuras:

1. **Cache inteligente**: Detectar relatórios duplicados por hash dos filtros
2. **Limpeza automática**: Cronjob para remover relatórios antigos
3. **Compressão**: Compactar arquivos antigos
4. **Permissões**: Sistema de controle de acesso por usuário
5. **Compartilhamento**: Links públicos temporários para relatórios

---

## 🐛 Troubleshooting

### Erro: "Tabela relatorios_salvos não existe"

Execute a migration:
```bash
psql -U postgres -d residencia -f migrations/001_create_relatorios_table.sql
```

### Erro: "Arquivo não encontrado no disco"

O arquivo foi removido manualmente. Remova o registro do banco:
```bash
curl -X DELETE http://localhost:3000/relatorios/salvos/ID
```

### Pasta storage não existe

O sistema cria automaticamente na inicialização. Se houver erro, crie manualmente:
```bash
mkdir storage
```

---

## 📚 Documentação Swagger

Acesse a documentação interativa em:
```
http://localhost:3000/docs
```

Todas as novas rotas estão documentadas com exemplos e esquemas.
