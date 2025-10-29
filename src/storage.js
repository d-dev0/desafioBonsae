import { mkdir, stat } from 'fs/promises';
import path from 'path';
import { config } from './config.js';
import { pool } from './db.js';

export const ensureStorageDir = async () => {
  try { await stat(config.storageDir); } 
  catch { await mkdir(config.storageDir, { recursive: true }); }
};

export const resolveStoragePath = (filename) => path.resolve(config.storageDir, filename);

export const salvarRelatorio = async (dados) => {
  const result = await pool.query(`
    INSERT INTO solicitacoes_relatorio (tipo_relatorio, arquivo_nome, arquivo_path, tamanho_bytes,
      filtros, estatisticas, usuario_solicitante, status, data_conclusao)
    VALUES ($1, $2, $3, $4, $5, $6, $7, 'concluido', NOW()) RETURNING id
  `, [dados.tipo, dados.arquivo_nome, dados.arquivo_path, dados.tamanho_bytes || null,
      JSON.stringify(dados.filtros || {}), JSON.stringify(dados.estatisticas || {}), dados.criado_por || 'system']);
  return result.rows[0].id;
};

export const listarRelatorios = async (opcoes = {}) => {
  const params = [];
  let query = `SELECT id, tipo_relatorio as tipo, arquivo_nome, tamanho_bytes, filtros, estatisticas,
    data_solicitacao as criado_em, usuario_solicitante as criado_por, downloads, ultimo_download, status, data_conclusao
    FROM solicitacoes_relatorio WHERE status = 'concluido' AND arquivo_nome IS NOT NULL`;
  
  if (opcoes.tipo) { params.push(opcoes.tipo); query += ` AND tipo_relatorio = $${params.length}`; }
  query += ` ORDER BY data_solicitacao DESC`;
  if (opcoes.limite) { params.push(opcoes.limite); query += ` LIMIT $${params.length}`; }
  
  return (await pool.query(query, params)).rows;
};

export const buscarRelatorioSalvo = async (id) => {
  const result = await pool.query(`
    SELECT id, tipo_relatorio as tipo, arquivo_nome, arquivo_path, tamanho_bytes, filtros, estatisticas,
      data_solicitacao as criado_em, usuario_solicitante as criado_por, downloads, ultimo_download, status, turma_id
    FROM solicitacoes_relatorio WHERE id = $1
  `, [id]);
  return result.rows[0] || null;
};

export const registrarDownload = async (id) => 
  await pool.query('UPDATE solicitacoes_relatorio SET downloads = downloads + 1, ultimo_download = NOW() WHERE id = $1', [id]);

export const removerRelatorio = async (id) => 
  (await pool.query('DELETE FROM solicitacoes_relatorio WHERE id = $1', [id])).rowCount > 0;
