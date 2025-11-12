# Script para executar a migration no PostgreSQL

Write-Host "🔧 Executando migration para adicionar colunas..." -ForegroundColor Cyan
Write-Host ""

$DB_HOST = "localhost"
$DB_PORT = "5432"
$DB_USER = "postgres"
$DB_NAME = "residencia"
$MIGRATION_FILE = "migrations\002_add_columns_to_solicitacoes.sql"

# Verificar se arquivo existe
if (-not (Test-Path $MIGRATION_FILE)) {
    Write-Host "❌ Arquivo de migration não encontrado: $MIGRATION_FILE" -ForegroundColor Red
    exit 1
}

Write-Host "📄 Lendo SQL do arquivo: $MIGRATION_FILE" -ForegroundColor Yellow

# Ler conteúdo do arquivo SQL
$sqlContent = Get-Content $MIGRATION_FILE -Raw

# Tentar encontrar psql
$psqlPaths = @(
    "psql",
    "C:\Program Files\PostgreSQL\15\bin\psql.exe",
    "C:\Program Files\PostgreSQL\14\bin\psql.exe",
    "C:\Program Files\PostgreSQL\16\bin\psql.exe"
)

$psqlCmd = $null
foreach ($path in $psqlPaths) {
    if (Get-Command $path -ErrorAction SilentlyContinue) {
        $psqlCmd = $path
        break
    }
}

if ($null -eq $psqlCmd) {
    Write-Host "❌ PostgreSQL (psql) não encontrado no PATH" -ForegroundColor Red
    Write-Host ""
    Write-Host "💡 Opções:" -ForegroundColor Yellow
    Write-Host "   1. Adicione PostgreSQL ao PATH do Windows" -ForegroundColor White
    Write-Host "   2. Execute manualmente no pgAdmin ou outro cliente:" -ForegroundColor White
    Write-Host ""
    Write-Host "📋 Copie e execute este SQL:" -ForegroundColor Cyan
    Write-Host ""
    Write-Host $sqlContent -ForegroundColor White
    exit 1
}

Write-Host "✅ psql encontrado: $psqlCmd" -ForegroundColor Green
Write-Host ""
Write-Host "🔐 Conectando ao banco de dados..." -ForegroundColor Cyan
Write-Host "   Host: $DB_HOST" -ForegroundColor Gray
Write-Host "   Database: $DB_NAME" -ForegroundColor Gray
Write-Host "   User: $DB_USER" -ForegroundColor Gray
Write-Host ""

try {
    # Executar migration
    & $psqlCmd -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f $MIGRATION_FILE
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "✅ Migration executada com sucesso!" -ForegroundColor Green
        Write-Host ""
        Write-Host "🔍 Verificando colunas..." -ForegroundColor Cyan
        
        # Verificar se as colunas foram criadas
        $checkSQL = "\d solicitacoes_relatorio"
        & $psqlCmd -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c $checkSQL
        
        Write-Host ""
        Write-Host "🚀 Agora você pode iniciar o servidor:" -ForegroundColor Green
        Write-Host "   npm start" -ForegroundColor White
    } else {
        Write-Host ""
        Write-Host "❌ Erro ao executar migration" -ForegroundColor Red
    }
} catch {
    Write-Host ""
    Write-Host "❌ Erro: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "💡 Tente executar manualmente:" -ForegroundColor Yellow
    Write-Host "   psql -U postgres -d residencia -f $MIGRATION_FILE" -ForegroundColor White
}
