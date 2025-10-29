#!/bin/bash
# Script de teste para o sistema de relatórios salvos

BASE_URL="http://localhost:3000"

echo "🧪 Testando Sistema de Relatórios Salvos"
echo "========================================"
echo ""

# 1. Gerar um relatório Excel
echo "1️⃣ Gerando relatório Excel..."
curl -s "${BASE_URL}/download/excel?turma_id=1" -o test-relatorio.xlsx
if [ -f "test-relatorio.xlsx" ]; then
    echo "   ✅ Excel gerado com sucesso"
    rm test-relatorio.xlsx
else
    echo "   ❌ Erro ao gerar Excel"
fi
echo ""

# 2. Gerar um relatório PDF
echo "2️⃣ Gerando relatório PDF..."
curl -s "${BASE_URL}/download/pdf?turma_id=1" -o test-relatorio.pdf
if [ -f "test-relatorio.pdf" ]; then
    echo "   ✅ PDF gerado com sucesso"
    rm test-relatorio.pdf
else
    echo "   ❌ Erro ao gerar PDF"
fi
echo ""

# 3. Listar todos os relatórios
echo "3️⃣ Listando relatórios salvos..."
RELATORIOS=$(curl -s "${BASE_URL}/relatorios/salvos")
TOTAL=$(echo $RELATORIOS | grep -o '"total":[0-9]*' | grep -o '[0-9]*')
echo "   📊 Total de relatórios: ${TOTAL}"
echo ""

# 4. Buscar primeiro relatório
echo "4️⃣ Buscando detalhes do primeiro relatório..."
PRIMEIRO_ID=$(echo $RELATORIOS | grep -o '"id":[0-9]*' | head -1 | grep -o '[0-9]*')
if [ ! -z "$PRIMEIRO_ID" ]; then
    DETALHE=$(curl -s "${BASE_URL}/relatorios/salvos/${PRIMEIRO_ID}")
    NOME=$(echo $DETALHE | grep -o '"nome":"[^"]*"' | cut -d'"' -f4)
    echo "   📄 ID: ${PRIMEIRO_ID}"
    echo "   📄 Nome: ${NOME}"
    
    # 5. Baixar relatório salvo
    echo ""
    echo "5️⃣ Baixando relatório salvo (ID: ${PRIMEIRO_ID})..."
    curl -s "${BASE_URL}/relatorios/salvos/${PRIMEIRO_ID}/download" -o test-download.file
    if [ -f "test-download.file" ]; then
        TAMANHO=$(ls -lh test-download.file | awk '{print $5}')
        echo "   ✅ Download realizado: ${TAMANHO}"
        rm test-download.file
    else
        echo "   ❌ Erro ao baixar relatório"
    fi
else
    echo "   ⚠️  Nenhum relatório encontrado"
fi
echo ""

# 6. Filtrar por tipo
echo "6️⃣ Listando apenas relatórios Excel..."
EXCELS=$(curl -s "${BASE_URL}/relatorios/salvos?tipo=excel")
TOTAL_EXCEL=$(echo $EXCELS | grep -o '"total":[0-9]*' | grep -o '[0-9]*')
echo "   📊 Total de Excel: ${TOTAL_EXCEL}"
echo ""

echo "7️⃣ Listando apenas relatórios PDF..."
PDFS=$(curl -s "${BASE_URL}/relatorios/salvos?tipo=pdf")
TOTAL_PDF=$(echo $PDFS | grep -o '"total":[0-9]*' | grep -o '[0-9]*')
echo "   📊 Total de PDF: ${TOTAL_PDF}"
echo ""

# 8. Teste de remoção (opcional - comentado por segurança)
# echo "8️⃣ Testando remoção de relatório..."
# if [ ! -z "$PRIMEIRO_ID" ]; then
#     curl -s -X DELETE "${BASE_URL}/relatorios/salvos/${PRIMEIRO_ID}"
#     echo "   🗑️  Relatório ${PRIMEIRO_ID} removido"
# fi
# echo ""

echo "✅ Testes concluídos!"
echo ""
echo "💡 Para ver a documentação completa:"
echo "   ${BASE_URL}/docs"
echo ""
echo "📖 Para mais informações:"
echo "   cat RELATORIOS_SALVOS.md"
