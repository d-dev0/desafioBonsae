import { mkdir, stat } from 'fs/promises';
import path from 'path';
import { config } from './config.js';
import { pool } from './db.js';

export async function ensureStorageDir() {
  try {
    await stat(config.storageDir);
  } catch (err) {
    await mkdir(config.storageDir, { recursive: true });
  }
}

export function resolveStoragePath(filename) {
  return path.resolve(config.storageDir, filename);
}

/**
 * Salva metadados do relatório no banco de dados
 * @param {Object} dados - Dados do relatório
 * @param {string} dados.nome - Nome descritivo do relatório
 * @param {string} dados.tipo - Tipo do relatório (excel ou pdf)
 * @param {string} dados.arquivo_nome - Nome do arquivo gerado
 * @param {string} dados.arquivo_path - Caminho completo do arquivo
 * @param {number} dados.tamanho_bytes - Tamanho do arquivo em bytes
 * @param {Object} dados.filtros - Filtros aplicados no relatório
 * @param {Object} dados.estatisticas - Estatísticas do relatório
 * @param {string} dados.criado_por - Usuário que criou (opcional)
 * @returns {Promise<number>} ID do relatório salvo
 */
export async function salvarRelatorio(dados) {
  const query = `
    INSERT INTO solicitacoes_relatorio (
      tipo_relatorio, arquivo_nome, arquivo_path, tamanho_bytes,
      filtros, estatisticas, usuario_solicitante, status, data_conclusao
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'concluido', NOW())
    RETURNING id
  `;
  
  const values = [
    dados.tipo,
    dados.arquivo_nome,
    dados.arquivo_path,
    dados.tamanho_bytes || null,
    JSON.stringify(dados.filtros || {}),
    JSON.stringify(dados.estatisticas || {}),
    dados.criado_por || 'system'
  ];
  
  const result = await pool.query(query, values);
  return result.rows[0].id;
}

/**
 * Lista todos os relatórios salvos
 * @param {Object} opcoes - Opções de filtro
 * @param {string} opcoes.tipo - Filtrar por tipo (excel ou pdf)
 * @param {number} opcoes.limite - Limite de resultados
 * @returns {Promise<Array>} Lista de relatórios
 */
export async function listarRelatorios(opcoes = {}) {
  let query = `
    SELECT 
      id, tipo_relatorio as tipo, arquivo_nome, tamanho_bytes,
      filtros, estatisticas, data_solicitacao as criado_em, 
      usuario_solicitante as criado_por, downloads, ultimo_download,
      status, data_conclusao
    FROM solicitacoes_relatorio
    WHERE status = 'concluido' AND arquivo_nome IS NOT NULL
  `;
  
  const params = [];
  
  if (opcoes.tipo) {
    params.push(opcoes.tipo);
    query += ` AND tipo_relatorio = $${params.length}`;
  }
  
  query += ` ORDER BY data_solicitacao DESC`;
  
  if (opcoes.limite) {
    params.push(opcoes.limite);
    query += ` LIMIT $${params.length}`;
  }
  
  const result = await pool.query(query, params);
  return result.rows;
}

/**
 * Busca um relatório salvo por ID
 * @param {number} id - ID do relatório
 * @returns {Promise<Object|null>} Dados do relatório ou null
 */
export async function buscarRelatorioSalvo(id) {
  const query = `
    SELECT 
      id, tipo_relatorio as tipo, arquivo_nome, arquivo_path, tamanho_bytes,
      filtros, estatisticas, data_solicitacao as criado_em, 
      usuario_solicitante as criado_por, downloads, ultimo_download,
      status, turma_id
    FROM solicitacoes_relatorio
    WHERE id = $1
  `;
  
  const result = await pool.query(query, [id]);
  return result.rows[0] || null;
}

/**
 * Incrementa o contador de downloads de um relatório
 * @param {number} id - ID do relatório
 * @returns {Promise<void>}
 */
export async function registrarDownload(id) {
  const query = `
    UPDATE solicitacoes_relatorio
    SET downloads = downloads + 1,
        ultimo_download = NOW()
    WHERE id = $1
  `;
  
  await pool.query(query, [id]);
}

/**
 * Remove um relatório do banco de dados
 * @param {number} id - ID do relatório
 * @returns {Promise<boolean>} True se removido com sucesso
 */
export async function removerRelatorio(id) {
  const query = `DELETE FROM solicitacoes_relatorio WHERE id = $1`;
  const result = await pool.query(query, [id]);
  return result.rowCount > 0;
}
