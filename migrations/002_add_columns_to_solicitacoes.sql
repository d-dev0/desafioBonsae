-- Adicionar colunas necessárias para armazenar arquivos gerados
ALTER TABLE solicitacoes_relatorio
ADD COLUMN IF NOT EXISTS arquivo_nome VARCHAR(255),
ADD COLUMN IF NOT EXISTS arquivo_path TEXT,
ADD COLUMN IF NOT EXISTS tamanho_bytes BIGINT,
ADD COLUMN IF NOT EXISTS filtros JSONB,
ADD COLUMN IF NOT EXISTS estatisticas JSONB,
ADD COLUMN IF NOT EXISTS downloads INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS ultimo_download TIMESTAMP;

-- Adicionar índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_solicitacoes_tipo ON solicitacoes_relatorio(tipo_relatorio);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_status ON solicitacoes_relatorio(status);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_data ON solicitacoes_relatorio(data_solicitacao DESC);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_filtros ON solicitacoes_relatorio USING gin(filtros);

-- Comentários
COMMENT ON COLUMN solicitacoes_relatorio.arquivo_nome IS 'Nome do arquivo gerado';
COMMENT ON COLUMN solicitacoes_relatorio.arquivo_path IS 'Caminho completo do arquivo no disco';
COMMENT ON COLUMN solicitacoes_relatorio.tamanho_bytes IS 'Tamanho do arquivo em bytes';
COMMENT ON COLUMN solicitacoes_relatorio.filtros IS 'JSON com filtros aplicados (turma_id, professor_id, etc)';
COMMENT ON COLUMN solicitacoes_relatorio.estatisticas IS 'JSON com estatísticas do relatório';
COMMENT ON COLUMN solicitacoes_relatorio.downloads IS 'Contador de downloads do relatório';
