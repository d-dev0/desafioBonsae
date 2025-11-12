import { resolveStoragePath } from './storage.js';
import ExcelJS from 'exceljs';
import { randomUUID } from 'crypto';

export async function generateLargeXlsx(options) {
  const [rows, cols, title] = [Number(options?.rows || 20000), Number(options?.columns || 10), options?.title || 'Relatório de Vendas'];
  const fileName = `${Date.now()}-${randomUUID()}.xlsx`;
  const filePath = resolveStoragePath(fileName);
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ filename: filePath, useStyles: true });
  const sheet = workbook.addWorksheet('Dados');

  sheet.addRow([`Título: ${title}`]).commit();
  sheet.addRow([`Gerado em: ${new Date().toISOString()}`]).commit();
  sheet.addRow([]).commit();
  sheet.addRow(Array.from({ length: cols }, (_, i) => `Coluna_${i + 1}`)).commit();

  for (let r = 1; r <= rows; r++) {
    sheet.addRow(Array.from({ length: cols }, (_, c) => `R${r}C${c + 1}`)).commit();
    if (r % 5000 === 0) await new Promise(res => setImmediate(res));
  }

  await workbook.commit();
  return { filePath, fileName };
}
