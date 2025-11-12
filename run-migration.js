// Script para executar migration usando Node.js
import { pool } from './src/db.js';
import { readFile } from 'fs/promises';

async function runMigration() {
  try {
    console.log('🔧 Executando migration...\n');
    
    // Ler arquivo SQL
    const sql = await readFile('migrations/002_add_columns_to_solicitacoes.sql', 'utf-8');
    
    console.log('📄 SQL lido do arquivo');
    console.log('🔌 Conectando ao banco de dados...\n');
    
    // Executar SQL
    await pool.query(sql);
    
    console.log('✅ Migration executada com sucesso!\n');
    
    // Verificar colunas criadas
    console.log('🔍 Verificando colunas da tabela solicitacoes_relatorio:\n');
    const result = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'solicitacoes_relatorio'
      ORDER BY ordinal_position
    `);
    
    console.log('Colunas encontradas:');
    result.rows.forEach(row => {
      console.log(`  - ${row.column_name} (${row.data_type})`);
    });
    
    console.log('\n✅ Tudo pronto!');
    console.log('\n🚀 Agora execute: npm start\n');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro ao executar migration:', error.message);
    console.error('\n💡 Detalhes:', error);
    process.exit(1);
  }
}

runMigration();
