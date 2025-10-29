import ExcelJS from "exceljs";
import { pool } from "./db.js";
import { resolveStoragePath } from "./storage.js";
import { randomUUID } from "crypto";

export async function generateTurmaReport(turmaId) {
  const fileName = `turma-${turmaId}-${Date.now()}-${randomUUID()}.xlsx`;
  const filePath = resolveStoragePath(fileName);

  const result = await pool.query(`
    SELECT a.id AS aluno_id, a.nome AS aluno_nome, a.email, t.nome AS turma_nome,
      atv.nome AS atividade, atv.tipo, p.presenca, p.horas, p.nota, p.conceito, p.status_avaliacao
    FROM participacoes p JOIN alunos a ON a.id = p.aluno_id JOIN atividades atv ON atv.id = p.atividade_id
    JOIN turmas t ON t.id = p.turma_id WHERE p.turma_id = $1 ORDER BY a.id, atv.id
  `, [turmaId]);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Relatório Turma");
  sheet.addRow(["ID Aluno", "Nome", "Email", "Turma", "Atividade", "Tipo", "Presença", "Horas", "Nota", "Conceito", "Status Avaliação"]);
  result.rows.forEach(r => sheet.addRow([r.aluno_id, r.aluno_nome, r.email, r.turma_nome, r.atividade, r.tipo, r.presenca ? "Presente" : "Faltou", r.horas, r.nota, r.conceito, r.status_avaliacao]));
  await workbook.xlsx.writeFile(filePath);
  return { filePath, fileName };
}
