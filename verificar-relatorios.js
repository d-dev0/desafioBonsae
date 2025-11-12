// Script para verificar o estado dos relatórios no banco
import { pool } from './src/db.js';

async function verificar() {
  try {
    console.log('🔍 Verificando configuração do banco...\n');
    
    // 1. Verificar se a tabela existe
    console.log('1️⃣ Verificando tabela solicitacoes_relatorio...');
    const tabelaExiste = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'solicitacoes_relatorio'
      )
    `);
    
    if (!tabelaExiste.rows[0].exists) {
      console.log('❌ Tabela solicitacoes_relatorio não existe!\n');
      console.log('Execute: node run-migration.js\n');
      process.exit(1);
    }
    console.log('✅ Tabela encontrada\n');
    
    // 2. Verificar colunas
    console.log('2️⃣ Verificando colunas necessárias...');
    const colunas = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'solicitacoes_relatorio'
      ORDER BY ordinal_position
    `);
    
    const colunasNecessarias = ['arquivo_nome', 'arquivo_path', 'tamanho_bytes', 'filtros', 'estatisticas', 'downloads', 'ultimo_download'];
    const colunasExistentes = colunas.rows.map(r => r.column_name);
    
    console.log('Colunas existentes:', colunasExistentes.join(', '));
    
    const colunasFaltando = colunasNecessarias.filter(c => !colunasExistentes.includes(c));
    if (colunasFaltando.length > 0) {
      console.log('\n❌ Colunas faltando:', colunasFaltando.join(', '));
      console.log('\nExecute: node run-migration.js\n');
      process.exit(1);
    }
    console.log('✅ Todas as colunas necessárias existem\n');
    
    // 3. Verificar relatórios salvos
    console.log('3️⃣ Verificando relatórios salvos...');
    const total = await pool.query('SELECT COUNT(*) FROM solicitacoes_relatorio');
    console.log(`Total de registros na tabela: ${total.rows[0].count}\n`);
    
    const comArquivo = await pool.query(`
      SELECT COUNT(*) 
      FROM solicitacoes_relatorio 
      WHERE arquivo_nome IS NOT NULL
    `);
    console.log(`Registros com arquivo_nome: ${comArquivo.rows[0].count}`);
    
    const concluidos = await pool.query(`
      SELECT COUNT(*) 
      FROM solicitacoes_relatorio 
      WHERE status = 'concluido' AND arquivo_nome IS NOT NULL
    `);
    console.log(`Registros concluídos com arquivo: ${concluidos.rows[0].count}\n`);
    
    // 4. Mostrar relatórios que deveriam aparecer
    console.log('4️⃣ Relatórios que deveriam aparecer na lista:');
    const relatorios = await pool.query(`
      SELECT 
        id, 
        tipo_relatorio, 
        arquivo_nome, 
        status,
        data_solicitacao,
        downloads
      FROM solicitacoes_relatorio 
      WHERE status = 'concluido' AND arquivo_nome IS NOT NULL
      ORDER BY data_solicitacao DESC
      LIMIT 10
    `);
    
    if (relatorios.rows.length === 0) {
      console.log('❌ Nenhum relatório concluído com arquivo encontrado!\n');
      console.log('💡 Para aparecer na lista, o relatório precisa ter:');
      console.log('   - status = "concluido"');
      console.log('   - arquivo_nome preenchido\n');
      console.log('📝 Registros existentes na tabela:');
      const todos = await pool.query(`
        SELECT id, tipo_relatorio, status, arquivo_nome
        FROM solicitacoes_relatorio 
        ORDER BY id DESC 
        LIMIT 5
      `);
      todos.rows.forEach(r => {
        console.log(`   ID ${r.id}: ${r.tipo_relatorio || 'sem tipo'} - Status: ${r.status} - Arquivo: ${r.arquivo_nome || 'NULL'}`);
      });
    } else {
      console.log('✅ Encontrados:');
      relatorios.rows.forEach(r => {
        console.log(`   • ID ${r.id}: ${r.tipo_relatorio} - ${r.arquivo_nome} - Downloads: ${r.downloads || 0}`);
      });
    }
    
    console.log('\n✅ Verificação concluída!');
    
    if (relatorios.rows.length === 0 && total.rows[0].count === 0) {
      console.log('\n💡 Dica: Gere um relatório acessando:');
      console.log('   http://localhost:3000/docs');
      console.log('   E use GET /download/excel ou GET /download/pdf');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Erro:', error.message);
    console.error('\nDetalhes:', error);
    process.exit(1);
  }
}

verificar();
