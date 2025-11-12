# Script de teste para o sistema de relatórios salvos (PowerShell)

$BaseUrl = "http://localhost:3000"

Write-Host "🧪 Testando Sistema de Relatórios Salvos" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Gerar um relatório Excel
Write-Host "1️⃣ Gerando relatório Excel..." -ForegroundColor Yellow
try {
    Invoke-WebRequest -Uri "$BaseUrl/download/excel?turma_id=1" -OutFile "test-relatorio.xlsx" -ErrorAction Stop
    Write-Host "   ✅ Excel gerado com sucesso" -ForegroundColor Green
    Remove-Item "test-relatorio.xlsx" -ErrorAction SilentlyContinue
} catch {
    Write-Host "   ❌ Erro ao gerar Excel: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# 2. Gerar um relatório PDF
Write-Host "2️⃣ Gerando relatório PDF..." -ForegroundColor Yellow
try {
    Invoke-WebRequest -Uri "$BaseUrl/download/pdf?turma_id=1" -OutFile "test-relatorio.pdf" -ErrorAction Stop
    Write-Host "   ✅ PDF gerado com sucesso" -ForegroundColor Green
    Remove-Item "test-relatorio.pdf" -ErrorAction SilentlyContinue
} catch {
    Write-Host "   ❌ Erro ao gerar PDF: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# 3. Listar todos os relatórios
Write-Host "3️⃣ Listando relatórios salvos..." -ForegroundColor Yellow
try {
    $relatorios = Invoke-RestMethod -Uri "$BaseUrl/relatorios/salvos" -Method Get
    Write-Host "   📊 Total de relatórios: $($relatorios.total)" -ForegroundColor Cyan
    Write-Host ""
    
    if ($relatorios.total -gt 0) {
        # 4. Buscar primeiro relatório
        Write-Host "4️⃣ Detalhes do primeiro relatório:" -ForegroundColor Yellow
        $primeiro = $relatorios.relatorios[0]
        Write-Host "   📄 ID: $($primeiro.id)" -ForegroundColor Cyan
        Write-Host "   📄 Nome: $($primeiro.nome)" -ForegroundColor Cyan
        Write-Host "   📄 Tipo: $($primeiro.tipo)" -ForegroundColor Cyan
        Write-Host "   📄 Tamanho: $($primeiro.tamanho_mb) MB" -ForegroundColor Cyan
        Write-Host "   📄 Downloads: $($primeiro.downloads)" -ForegroundColor Cyan
        Write-Host ""
        
        # 5. Baixar relatório salvo
        Write-Host "5️⃣ Baixando relatório salvo (ID: $($primeiro.id))..." -ForegroundColor Yellow
        try {
            Invoke-WebRequest -Uri "$BaseUrl/relatorios/salvos/$($primeiro.id)/download" -OutFile "test-download.file" -ErrorAction Stop
            $arquivo = Get-Item "test-download.file"
            Write-Host "   ✅ Download realizado: $([math]::Round($arquivo.Length / 1KB, 2)) KB" -ForegroundColor Green
            Remove-Item "test-download.file" -ErrorAction SilentlyContinue
        } catch {
            Write-Host "   ❌ Erro ao baixar: $($_.Exception.Message)" -ForegroundColor Red
        }
    } else {
        Write-Host "   ⚠️  Nenhum relatório encontrado" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ❌ Erro ao listar: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# 6. Filtrar por tipo Excel
Write-Host "6️⃣ Listando apenas relatórios Excel..." -ForegroundColor Yellow
try {
    $excels = Invoke-RestMethod -Uri "$BaseUrl/relatorios/salvos?tipo=excel" -Method Get
    Write-Host "   📊 Total de Excel: $($excels.total)" -ForegroundColor Cyan
} catch {
    Write-Host "   ❌ Erro: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# 7. Filtrar por tipo PDF
Write-Host "7️⃣ Listando apenas relatórios PDF..." -ForegroundColor Yellow
try {
    $pdfs = Invoke-RestMethod -Uri "$BaseUrl/relatorios/salvos?tipo=pdf" -Method Get
    Write-Host "   📊 Total de PDF: $($pdfs.total)" -ForegroundColor Cyan
} catch {
    Write-Host "   ❌ Erro: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# 8. Teste de remoção (opcional - comentado por segurança)
<#
Write-Host "8️⃣ Testando remoção de relatório..." -ForegroundColor Yellow
if ($primeiro.id) {
    try {
        $resultado = Invoke-RestMethod -Uri "$BaseUrl/relatorios/salvos/$($primeiro.id)" -Method Delete
        Write-Host "   🗑️  Relatório $($primeiro.id) removido" -ForegroundColor Green
    } catch {
        Write-Host "   ❌ Erro ao remover: $($_.Exception.Message)" -ForegroundColor Red
    }
}
Write-Host ""
#>

Write-Host "✅ Testes concluídos!" -ForegroundColor Green
Write-Host ""
Write-Host "💡 Para ver a documentação completa:" -ForegroundColor Cyan
Write-Host "   $BaseUrl/docs" -ForegroundColor White
Write-Host ""
Write-Host "📖 Para mais informações:" -ForegroundColor Cyan
Write-Host "   Get-Content RELATORIOS_SALVOS.md" -ForegroundColor White
