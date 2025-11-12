# 🧪 Testar Sistema de Relatórios no Swagger UI

## 📍 Acessar o Swagger

1. Inicie o servidor:
```bash
npm run dev
```

2. Abra no navegador:
```
http://localhost:3000/docs
```

---

## 📋 Endpoints Disponíveis

Você verá os endpoints organizados em 3 categorias:

### 🟢 **Relatórios JSON**
- `POST /relatorio` - Retorna dados em JSON sem gerar arquivo

### 🔵 **Gerar Relatórios** 
- `GET /download/excel` - Gera Excel e salva no banco
- `GET /download/pdf` - Gera PDF e salva no banco

### 🟣 **Relatórios Salvos** (NOVOS)
- `GET /relatorios/salvos` - Lista todos os relatórios salvos
- `GET /relatorios/salvos/{id}` - Detalhes de um relatório
- `GET /relatorios/salvos/{id}/download` - Baixa relatório salvo
- `DELETE /relatorios/salvos/{id}` - Remove relatório

---

## 🎯 Passo a Passo para Testar

### **1️⃣ Gerar um Relatório Excel**

1. Expanda **"Gerar Relatórios"** → **GET /download/excel**
2. Clique em **"Try it out"**
3. Preencha os parâmetros:
   - `turma_id`: `1`
   - `professor_id`: `1` (opcional)
4. Clique em **"Execute"**
5. No response, clique em **"Download file"** para baixar o Excel

✅ **Resultado**: Arquivo Excel gerado e salvo automaticamente no banco!

---

### **2️⃣ Listar Relatórios Salvos**

1. Expanda **"Relatórios Salvos"** → **GET /relatorios/salvos**
2. Clique em **"Try it out"**
3. (Opcional) Adicione filtros:
   - `tipo`: `excel` (para ver só Excel)
   - `limite`: `10` (limitar resultados)
4. Clique em **"Execute"**

✅ **Resultado**: Você verá o relatório que acabou de gerar!

**Exemplo de resposta:**
```json
{
  "total": 1,
  "relatorios": [
    {
      "id": 1,
      "nome": "Relatório Excel - 29/10/2025 17:30:45",
      "tipo": "excel",
      "arquivo_nome": "relatorio-1730234445123.xlsx",
      "tamanho_mb": "0.05",
      "downloads": 0,
      "criado_em": "2025-10-29T20:30:45.123Z",
      "url_download": "http://localhost:3000/relatorios/salvos/1/download"
    }
  ]
}
```

---

### **3️⃣ Ver Detalhes de um Relatório**

1. Copie o **ID** do relatório (exemplo: `1`)
2. Expanda **"Relatórios Salvos"** → **GET /relatorios/salvos/{id}**
3. Clique em **"Try it out"**
4. Cole o ID no campo `id`
5. Clique em **"Execute"**

✅ **Resultado**: Detalhes completos incluindo filtros e estatísticas!

---

### **4️⃣ Baixar um Relatório Salvo**

1. Expanda **"Relatórios Salvos"** → **GET /relatorios/salvos/{id}/download**
2. Clique em **"Try it out"**
3. Digite o ID (exemplo: `1`)
4. Clique em **"Execute"**
5. Clique em **"Download file"**

✅ **Resultado**: Download instantâneo sem regenerar!  
✅ **Contador de downloads incrementado automaticamente!**

---

### **5️⃣ Gerar um Relatório PDF**

1. Expanda **"Gerar Relatórios"** → **GET /download/pdf**
2. Clique em **"Try it out"**
3. Preencha `turma_id`: `1`
4. Clique em **"Execute"**
5. Baixe o PDF

✅ **Resultado**: PDF salvo no banco também!

---

### **6️⃣ Filtrar Apenas PDFs**

1. Expanda **"Relatórios Salvos"** → **GET /relatorios/salvos**
2. Clique em **"Try it out"**
3. Em `tipo`, selecione: `pdf`
4. Clique em **"Execute"**

✅ **Resultado**: Lista apenas os relatórios PDF!

---

### **7️⃣ Remover um Relatório (Opcional)**

1. Expanda **"Relatórios Salvos"** → **DELETE /relatorios/salvos/{id}**
2. Clique em **"Try it out"**
3. Digite o ID que deseja remover
4. Clique em **"Execute"**

✅ **Resultado**: Relatório removido do banco e do disco!

---

## 🎨 Funcionalidades do Swagger UI

### **Try it out**
- Habilita os campos para você preencher e testar

### **Execute**
- Executa a requisição real para a API

### **Responses**
- Mostra exemplos de resposta
- Response body: Dados retornados
- Response headers: Cabeçalhos HTTP

### **Schemas**
- Estrutura completa dos objetos JSON

### **Download file**
- Aparece para endpoints que retornam arquivos (Excel/PDF)

---

## 🔍 Verificações Importantes

### ✅ Antes de testar:

1. **Servidor rodando**: `npm run dev`
2. **Tabela criada**: Execute a migration SQL
3. **Swagger acessível**: `http://localhost:3000/docs`

### 🐛 Se algo der errado:

1. **Erro 404**: Verifique se o servidor está rodando
2. **Erro 500**: Veja os logs do console do servidor
3. **Tabela não existe**: Execute a migration SQL
4. **Pasta storage**: Criada automaticamente na inicialização

---

## 📊 Fluxo Completo de Teste

```
1. Gerar Excel (turma_id=1)
   ↓
2. Listar relatórios salvos
   ↓
3. Ver detalhes do ID 1
   ↓
4. Baixar relatório ID 1
   ↓
5. Verificar contador de downloads aumentou
   ↓
6. Gerar PDF (turma_id=1)
   ↓
7. Listar novamente (agora tem 2)
   ↓
8. Filtrar só Excel
   ↓
9. (Opcional) Remover um relatório
```

---

## 💡 Dicas

### **Copiar como cURL**
No Swagger, após executar, você pode copiar o comando cURL para usar no terminal:
```bash
curl -X 'GET' \
  'http://localhost:3000/relatorios/salvos?tipo=excel&limite=10' \
  -H 'accept: application/json'
```

### **Testar Filtros Combinados**
Experimente combinar filtros na geração:
- `turma_id=1` + `professor_id=1`
- `turma_id=1` + `status=Aprovado`
- `presenca=true` + `conceito=A`

### **Ver Estatísticas**
Ao listar relatórios, você vê as estatísticas salvas:
- Total de alunos
- Média de notas
- Frequência
- Filtros aplicados

---

## 🎯 Exemplo Prático Completo

### Cenário: Gerar e reutilizar relatório

1. **Gere Excel da Turma 1**:
   - `GET /download/excel?turma_id=1`
   - Tempo: ~2s (gera arquivo)

2. **Liste relatórios**:
   - `GET /relatorios/salvos`
   - Anote o ID retornado (ex: `1`)

3. **Baixe novamente**:
   - `GET /relatorios/salvos/1/download`
   - Tempo: <100ms (sem regenerar!)

4. **Verifique downloads**:
   - `GET /relatorios/salvos/1`
   - `downloads: 1`

5. **Baixe mais uma vez**:
   - `GET /relatorios/salvos/1/download`
   - `downloads: 2` agora!

---

## ✨ Vantagens Visíveis no Teste

✅ **Performance**: Download de relatórios salvos é instantâneo  
✅ **Rastreamento**: Vê quantas vezes cada relatório foi baixado  
✅ **Histórico**: Todos os relatórios gerados ficam registrados  
✅ **Filtros salvos**: Sabe exatamente quais filtros foram usados  
✅ **Estatísticas**: Metadados completos de cada relatório

---

## 🚀 Pronto!

Agora você pode testar todo o sistema de relatórios salvos diretamente no Swagger UI!

Acesse: **http://localhost:3000/docs**
