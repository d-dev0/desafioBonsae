import ExcelJS from "exceljs";
import { pool } from "./db.js";
import { resolveStoragePath } from "./storage.js";
import { randomUUID } from "crypto";

export async function generateAlunosReport() {
  const fileName = `alunos-${Date.now()}-${randomUUID()}.xlsx`;
  const filePath = resolveStoragePath(fileName);
  const result = await pool.query("SELECT id, nome, email FROM alunos ORDER BY id ASC");
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Alunos");
  
  sheet.addRow(["ID", "Nome", "Email"]);
  result.rows.forEach(a => sheet.addRow([a.id, a.nome, a.email]));
  await workbook.xlsx.writeFile(filePath);
  return { filePath, fileName };
}
