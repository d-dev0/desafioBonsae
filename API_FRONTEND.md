# 📚 API de Relatórios - Documentação para Frontend

Esta API REST permite gerenciar relatórios de alunos (Excel e PDF) com sistema de armazenamento e reutilização.

## 🌐 Base URL

```
http://localhost:3000
```

---

## 📊 Endpoints Disponíveis

### 1. **Gerar Relatório Excel**

Gera um novo relatório em formato Excel e salva automaticamente no banco de dados.

**Endpoint:**
```
GET /download/excel
```

**Query Parameters:**
| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `turma_id` | integer | Não | ID da turma para filtrar |
| `professor_id` | integer | Não | ID do professor para filtrar |
| `atividade_id` | integer | Não | ID da atividade para filtrar |
| `presenca` | string | Não | Filtrar por presença (true/false) |
| `conceito` | string | Não | Filtrar por conceito |
| `status` | string | Não | Filtrar por status (Aprovado/Reprovado/Pendente) |

**Exemplo de Requisição:**
```javascript
// Usando fetch
const response = await fetch('http://localhost:3000/download/excel?turma_id=1');
const blob = await response.blob();

// Criar link para download
const url = window.URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = 'relatorio.xlsx';
a.click();
```

**Response:**
- Status: `200 OK`
- Content-Type: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- Body: Arquivo binário (.xlsx)

---

### 2. **Gerar Relatório PDF**

Gera um novo relatório em formato PDF e salva automaticamente no banco de dados.

**Endpoint:**
```
GET /download/pdf
```

**Query Parameters:** (mesmos do Excel)

**Exemplo de Requisição:**
```javascript
const response = await fetch('http://localhost:3000/download/pdf?turma_id=1&professor_id=2');
const blob = await response.blob();

const url = window.URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = 'relatorio.pdf';
a.click();
```

**Response:**
- Status: `200 OK`
- Content-Type: `application/pdf`
- Body: Arquivo binário (.pdf)

---

### 3. **Listar Relatórios Salvos**

Lista todos os relatórios gerados e salvos no banco de dados.

**Endpoint:**
```
GET /relatorios/salvos
```

**Query Parameters:**
| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `tipo` | string | Não | Filtrar por tipo (`excel` ou `pdf`) |
| `limite` | integer | Não | Limitar número de resultados |

**Exemplo de Requisição:**
```javascript
// Listar todos
const response = await fetch('http://localhost:3000/relatorios/salvos');
const data = await response.json();

// Listar apenas Excel
const excel = await fetch('http://localhost:3000/relatorios/salvos?tipo=excel');

// Limitar a 10 resultados
const limitado = await fetch('http://localhost:3000/relatorios/salvos?limite=10');
```

**Response:**
```json
{
  "total": 4,
  "relatorios": [
    {
      "id": 4,
      "tipo": "pdf",
      "arquivo_nome": "relatorio-1761771947139.pdf",
      "tamanho_mb": "0.15",
      "filtros": {
        "turma_id": "1"
      },
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
      "status": "concluido",
      "url_download": "http://localhost:3000/relatorios/salvos/4/download"
    }
  ]
}
```

---

### 4. **Buscar Relatório Específico**

Retorna detalhes completos de um relatório específico.

**Endpoint:**
```
GET /relatorios/salvos/{id}
```

**Path Parameters:**
| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| `id` | integer | ID do relatório |

**Exemplo de Requisição:**
```javascript
const response = await fetch('http://localhost:3000/relatorios/salvos/1');
const relatorio = await response.json();
```

**Response:**
```json
{
  "id": 1,
  "tipo": "excel",
  "arquivo_nome": "relatorio-1761771234872.xlsx",
  "tamanho_mb": "0.05",
  "filtros": {
    "turma_id": "1",
    "professor_id": "2"
  },
  "estatisticas": {
    "totalAlunos": 10,
    "mediaNotas": 7.5
  },
  "criado_em": "2025-10-29T20:30:45.123Z",
  "criado_por": "system",
  "downloads": 1,
  "ultimo_download": "2025-10-29T20:45:12.789Z",
  "status": "concluido",
  "turma_id": 1,
  "url_download": "http://localhost:3000/relatorios/salvos/1/download"
}
```

**Errors:**
- `404 Not Found` - Relatório não encontrado

---

### 5. **Baixar Relatório Salvo**

Faz download de um relatório já gerado sem regenerá-lo. Incrementa o contador de downloads automaticamente.

**Endpoint:**
```
GET /relatorios/salvos/{id}/download
```

**Path Parameters:**
| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| `id` | integer | ID do relatório |

**Exemplo de Requisição:**
```javascript
const response = await fetch('http://localhost:3000/relatorios/salvos/1/download');
const blob = await response.blob();

// Download automático
const url = window.URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = 'relatorio.xlsx'; // ou .pdf
a.click();
```

**Response:**
- Status: `200 OK`
- Content-Type: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` ou `application/pdf`
- Body: Arquivo binário

**Errors:**
- `404 Not Found` - Relatório não encontrado ou arquivo não existe no disco

---

### 6. **Remover Relatório**

Remove um relatório do banco de dados e do disco.

**Endpoint:**
```
DELETE /relatorios/salvos/{id}
```

**Path Parameters:**
| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| `id` | integer | ID do relatório |

**Exemplo de Requisição:**
```javascript
const response = await fetch('http://localhost:3000/relatorios/salvos/1', {
  method: 'DELETE'
});
const result = await response.json();
```

**Response:**
```json
{
  "success": true,
  "message": "Relatório removido com sucesso",
  "id": 1
}
```

**Errors:**
- `404 Not Found` - Relatório não encontrado

---

### 7. **Obter Relatório em JSON**

Retorna dados dos alunos em JSON sem gerar arquivo.

**Endpoint:**
```
POST /relatorio
```

**Request Body:**
```json
{
  "turma_id": 1,
  "professor_id": 2,
  "atividade_id": 5,
  "presenca": "true",
  "conceito": "A",
  "status": "Aprovado"
}
```

**Response:**
```json
{
  "meta": {
    "totalAlunos": 10,
    "totalAtividades": 50,
    "mediaNotas": 7.5,
    "frequencia": 85.2
  },
  "alunos": [
    {
      "aluno_id": 1,
      "nome": "João Silva",
      "turma": "Turma A",
      "total_workload": 40,
      "workload_real": 35,
      "workload_simulada": 5,
      "percentual_real": 87.5,
      "total_atividades": 10,
      "total_presencas": 9,
      "frequencia": 90.0,
      "media_nota": 8.5,
      "status": "Aprovado"
    }
  ]
}
```

---

## 🎨 Estrutura de Dados

### Objeto Relatório

```typescript
interface Relatorio {
  id: number;                    // ID único
  tipo: 'excel' | 'pdf';         // Tipo do relatório
  arquivo_nome: string;          // Nome do arquivo
  tamanho_mb: string;            // Tamanho em MB (formatado)
  filtros: object;               // Filtros aplicados
  estatisticas: {                // Estatísticas do relatório
    totalAlunos: number;
    totalAtividades: number;
    mediaNotas: number;
    frequencia: number;
  };
  criado_em: string;             // Data de criação (ISO)
  criado_por: string;            // Usuário que criou
  downloads: number;             // Contador de downloads
  ultimo_download: string | null; // Última data de download
  status: string;                // Status (sempre 'concluido')
  turma_id: number;              // ID da turma (se aplicável)
  url_download: string;          // URL para download direto
}
```

---

## 🔐 CORS

A API não tem CORS configurado. Para desenvolvimento local com frontend separado, adicione ao `server.js`:

```javascript
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});
```

---

## 📝 Exemplo de Integração Completa

```javascript
// Service para gerenciar relatórios
class RelatorioService {
  constructor(baseURL = 'http://localhost:3000') {
    this.baseURL = baseURL;
  }

  // Listar todos os relatórios
  async listar(tipo = null, limite = null) {
    const params = new URLSearchParams();
    if (tipo) params.append('tipo', tipo);
    if (limite) params.append('limite', limite);
    
    const response = await fetch(`${this.baseURL}/relatorios/salvos?${params}`);
    return await response.json();
  }

  // Buscar relatório específico
  async buscar(id) {
    const response = await fetch(`${this.baseURL}/relatorios/salvos/${id}`);
    if (!response.ok) throw new Error('Relatório não encontrado');
    return await response.json();
  }

  // Baixar relatório salvo
  async baixar(id, nomeArquivo) {
    const response = await fetch(`${this.baseURL}/relatorios/salvos/${id}/download`);
    const blob = await response.blob();
    
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nomeArquivo;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  // Gerar novo Excel
  async gerarExcel(filtros = {}) {
    const params = new URLSearchParams(filtros);
    const response = await fetch(`${this.baseURL}/download/excel?${params}`);
    const blob = await response.blob();
    
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-${Date.now()}.xlsx`;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  // Gerar novo PDF
  async gerarPDF(filtros = {}) {
    const params = new URLSearchParams(filtros);
    const response = await fetch(`${this.baseURL}/download/pdf?${params}`);
    const blob = await response.blob();
    
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-${Date.now()}.pdf`;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  // Remover relatório
  async remover(id) {
    const response = await fetch(`${this.baseURL}/relatorios/salvos/${id}`, {
      method: 'DELETE'
    });
    return await response.json();
  }
}

// Uso
const service = new RelatorioService();

// Listar relatórios
const { relatorios } = await service.listar('excel', 10);

// Baixar relatório
await service.baixar(1, 'meu-relatorio.xlsx');

// Gerar novo
await service.gerarExcel({ turma_id: 1, professor_id: 2 });
```

---

## 🧪 Testando com cURL

```bash
# Listar relatórios
curl http://localhost:3000/relatorios/salvos

# Filtrar apenas Excel
curl "http://localhost:3000/relatorios/salvos?tipo=excel"

# Buscar específico
curl http://localhost:3000/relatorios/salvos/1

# Baixar relatório
curl -OJ http://localhost:3000/relatorios/salvos/1/download

# Gerar novo Excel
curl "http://localhost:3000/download/excel?turma_id=1" -o relatorio.xlsx

# Remover relatório
curl -X DELETE http://localhost:3000/relatorios/salvos/1
```

---

## 📖 Swagger UI

Documentação interativa disponível em:
```
http://localhost:3000/docs
```

Você pode testar todos os endpoints diretamente pelo Swagger!

---

## 🚀 Pronto para Integração!

A API está completamente funcional e pronta para ser consumida pelo frontend. Todos os endpoints retornam JSON (exceto os de download que retornam arquivos binários).
