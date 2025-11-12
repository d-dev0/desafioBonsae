-- Tabela para armazenar relatórios gerados
CREATE TABLE IF NOT EXISTS relatorios_salvos (
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

-- Índices para melhor performance
CREATE INDEX idx_relatorios_tipo ON relatorios_salvos(tipo);
CREATE INDEX idx_relatorios_criado_em ON relatorios_salvos(criado_em DESC);
CREATE INDEX idx_relatorios_filtros ON relatorios_salvos USING gin(filtros);

-- Comentários
COMMENT ON TABLE relatorios_salvos IS 'Armazena metadados dos relatórios gerados para reaproveitamento';
COMMENT ON COLUMN relatorios_salvos.filtros IS 'JSON com os filtros aplicados no relatório';
COMMENT ON COLUMN relatorios_salvos.estatisticas IS 'JSON com estatísticas do relatório (total alunos, média, etc)';
