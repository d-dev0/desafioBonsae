import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { fileURLToPath } from "url";
import path from "path";
import { stat, readFile } from "fs/promises";
import { createWriteStream, existsSync } from "fs";
import { pool } from "./db.js";
import { salvarRelatorio, resolveStoragePath } from "./storage.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const timeToSec = (t) => {
  if (!t) return 0;
  const [h = 0, m = 0, s = 0] = String(t).split(":").map(Number);
  return h * 3600 + m * 60 + s;
};

const secToHHMMSS = (sec) => {
  const s = Math.max(0, Math.floor(sec));
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60]
    .map(v => String(v).padStart(2, "0")).join(":");
};

const aggregateByAluno = (rows) => {
  const map = new Map();
  rows.forEach(r => {
    const it = map.get(r.aluno_id) || { aluno_id: r.aluno_id, aluno: r.aluno, email: r.email, turma: r.turma, atividades: 0, presencas: 0, totalHorasSec: 0, notas: [] };
    it.atividades++;
    if (r.presenca) it.presencas++;
    it.totalHorasSec += timeToSec(r.horas);
    if (r.nota !== null && r.nota !== undefined) {
      it.notas.push(parseFloat(r.nota));
    }
    map.set(r.aluno_id, it);
  });
  
  return Array.from(map.values()).map(a => {
    const [realSec, simSec] = [a.totalHorasSec * 0.6, a.totalHorasSec * 0.4].map(Math.floor);
    const [acts_r, shifts_r, pract_r, certs_r] = [0.4, 0.25, 0.2, 0.15].map(p => Math.floor(realSec * p));
    const [acts_s, pract_s, certs_s] = [0.5, 0.35, 0.15].map(p => Math.floor(simSec * p));
    const mediaNotas = a.notas.length > 0 ? a.notas.reduce((sum, n) => sum + n, 0) / a.notas.length : null;
    
    return {
      aluno_id: a.aluno_id, aluno: a.aluno, email: a.email, turma: a.turma,
      total: secToHHMMSS(a.totalHorasSec),
      total_real: secToHHMMSS(realSec),
      total_simulada: secToHHMMSS(simSec),
      distribuicao: {
        pctReal: a.totalHorasSec ? +((realSec / a.totalHorasSec) * 100).toFixed(1) : 0,
        pctSimulada: a.totalHorasSec ? +((simSec / a.totalHorasSec) * 100).toFixed(1) : 0,
      },
      horas_por_tipo: {
        atividades_real: secToHHMMSS(acts_r), atividades_simulada: secToHHMMSS(acts_s),
        plantoes: secToHHMMSS(shifts_r),
        praticas_real: secToHHMMSS(pract_r), praticas_simulada: secToHHMMSS(pract_s),
        certificados_real: secToHHMMSS(certs_r), certificados_simulada: secToHHMMSS(certs_s),
      },
      participacao: {
        atividades: a.atividades, presencas: a.presencas,
        frequenciaPct: a.atividades ? +((a.presencas / a.atividades) * 100).toFixed(1) : 0,
      },
      mediaNotas: mediaNotas !== null ? +mediaNotas.toFixed(2) : null,
      totalNotas: a.notas.length,
    };
  }).sort((a, b) => a.aluno_id - b.aluno_id);
};

const buscarRelatorio = async (filtros = {}) => {
  const { turma_id, professor_id, atividade_id, aluno_id, presenca, conceito, status } = filtros;
  const params = [], where = [];
  
  let query = `SELECT a.id AS aluno_id, a.nome AS aluno, a.email, 
    t.id AS turma_id, t.nome AS turma, 
    atv.id AS atividade_id, atv.nome AS atividade, atv.tipo AS atividade_tipo,
    p.nota, p.conceito, p.presenca, p.horas, p.status_avaliacao,
    string_agg(DISTINCT prof.nome, ', ') AS professores
    FROM participacoes p JOIN alunos a ON a.id = p.aluno_id JOIN turmas t ON t.id = p.turma_id
    JOIN atividades atv ON atv.id = p.atividade_id LEFT JOIN professor_turma pt ON pt.turma_id = t.id
    LEFT JOIN professores prof ON prof.id = pt.professor_id`;

  if (turma_id) { params.push(turma_id); where.push(`t.id = $${params.length}`); }
  if (aluno_id) { params.push(aluno_id); where.push(`a.id = $${params.length}`); }
  if (professor_id) { params.push(professor_id); where.push(`prof.id = $${params.length}`); }
  if (atividade_id) { params.push(atividade_id); where.push(`atv.id = $${params.length}`); }
  if (presenca !== undefined && presenca !== "") {
    params.push(presenca === "Presente" || presenca === "true" || presenca === true);
    where.push(`p.presenca = $${params.length}`);
  }
  if (conceito) { params.push(conceito); where.push(`p.conceito = $${params.length}`); }
  
  if (where.length) query += " WHERE " + where.join(" AND ");
  query += ` GROUP BY a.id, t.id, atv.id, p.id ORDER BY a.id, atv.id`;
  
  const result = await pool.query(query, params);
  result.rows.forEach(r => r.status = r.nota === null ? "Pendente" : Number(r.nota) >= 6 ? "Aprovado" : "Reprovado");
  return status ? result.rows.filter(r => r.status === status) : result.rows;
};

const buscarRelatorioNotas = async (filtros = {}) => {
  const { turma_id, aluno_id, atividade_id, conceito, status } = filtros;
  const params = [], where = [];
  
  let query = `SELECT a.id AS aluno_id, a.nome AS aluno, a.email, 
    t.id AS turma_id, t.nome AS turma, 
    atv.id AS atividade_id, atv.nome AS atividade, atv.tipo AS atividade_tipo,
    p.nota, p.conceito, p.presenca, p.status_avaliacao,
    string_agg(DISTINCT prof.nome, ', ') AS professores
    FROM participacoes p JOIN alunos a ON a.id = p.aluno_id JOIN turmas t ON t.id = p.turma_id
    JOIN atividades atv ON atv.id = p.atividade_id LEFT JOIN professor_turma pt ON pt.turma_id = t.id
    LEFT JOIN professores prof ON prof.id = pt.professor_id`;

  if (turma_id) { params.push(turma_id); where.push(`t.id = $${params.length}`); }
  if (aluno_id) { params.push(aluno_id); where.push(`a.id = $${params.length}`); }
  if (atividade_id) { params.push(atividade_id); where.push(`atv.id = $${params.length}`); }
  if (conceito) { params.push(conceito); where.push(`p.conceito = $${params.length}`); }
  
  if (where.length) query += " WHERE " + where.join(" AND ");
  query += ` GROUP BY a.id, t.id, atv.id, p.id ORDER BY a.id, atv.id`;
  
  const result = await pool.query(query, params);
  result.rows.forEach(r => r.status = r.nota === null ? "Pendente" : Number(r.nota) >= 6 ? "Aprovado" : "Reprovado");
  return status ? result.rows.filter(r => r.status === status) : result.rows;
};

const aggregateByAlunoNotas = (rows) => {
  const map = new Map();
  rows.forEach(r => {
    const it = map.get(r.aluno_id) || { aluno_id: r.aluno_id, aluno: r.aluno, email: r.email, turma: r.turma, notas: [], atividades: 0, presencas: 0 };
    it.atividades++;
    if (r.presenca) it.presencas++;
    if (r.nota !== null && r.nota !== undefined) {
      it.notas.push(parseFloat(r.nota));
    }
    map.set(r.aluno_id, it);
  });
  
  return Array.from(map.values()).map(a => {
    const mediaNotas = a.notas.length > 0 ? a.notas.reduce((sum, n) => sum + n, 0) / a.notas.length : null;
    const notaMin = a.notas.length > 0 ? Math.min(...a.notas) : null;
    const notaMax = a.notas.length > 0 ? Math.max(...a.notas) : null;
    
    return {
      aluno_id: a.aluno_id,
      aluno: a.aluno,
      email: a.email,
      turma: a.turma,
      mediaNotas: mediaNotas !== null ? +mediaNotas.toFixed(2) : null,
      notaMin: notaMin !== null ? +notaMin.toFixed(2) : null,
      notaMax: notaMax !== null ? +notaMax.toFixed(2) : null,
      totalNotas: a.notas.length,
      totalAtividades: a.atividades,
      presencas: a.presencas,
      frequenciaPct: a.atividades ? +((a.presencas / a.atividades) * 100).toFixed(1) : 0,
    };
  }).sort((a, b) => a.aluno_id - b.aluno_id);
};

export async function gerarRelatorioHorasExcel({ filtros = {}, usuario } = {}) {
  const rows = await buscarRelatorio(filtros);
  if (!rows || rows.length === 0) {
    throw new Error("Nenhum dado encontrado para relatório de horas (Excel)");
  }
  const alunos = aggregateByAluno(rows);
  const turmaMap = new Map();
  alunos.forEach(a => {
    if (!turmaMap.has(a.turma)) turmaMap.set(a.turma, { totalSec: 0, count: 0 });
    const turmaData = turmaMap.get(a.turma);
    turmaData.totalSec += timeToSec(a.total);
    turmaData.count++;
  });
  const mediaPorTurma = Array.from(turmaMap.entries()).map(([turma, data]) => ({ turma, mediaHoras: secToHHMMSS(Math.floor(data.totalSec / data.count)), totalAlunos: data.count }));
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Horas por Aluno");
  sheet.columns = [
    { header: "Aluno", key: "aluno", width: 30 },
    { header: "Email", key: "email", width: 35 },
    { header: "Turma", key: "turma", width: 20 },
    { header: "Total de Horas", key: "total", width: 15 },
    { header: "Horas Reais (60%)", key: "total_real", width: 18 },
    { header: "Horas Simuladas (40%)", key: "total_simulada", width: 20 },
    { header: "Total Atividades", key: "atividades", width: 15 },
    { header: "Presenças", key: "presencas", width: 12 },
    { header: "Frequência %", key: "frequencia", width: 12 },
  ];
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };
  headerRow.height = 25;
  alunos.forEach((a, idx) => {
    const row = sheet.addRow({
      aluno: a.aluno,
      email: a.email,
      turma: a.turma,
      total: a.total,
      total_real: a.total_real,
      total_simulada: a.total_simulada,
      atividades: a.participacao.atividades,
      presencas: a.participacao.presencas,
      frequencia: a.participacao.frequenciaPct + '%'
    });
    if (idx % 2 === 0) row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F2F2" } };
    row.eachCell(cell => cell.alignment = { horizontal: "center", vertical: "middle" });
  });
  sheet.addRow([]);
  sheet.addRow([]);
  const turmaHeaderRow = sheet.addRow(["Média de Horas por Turma"]);
  turmaHeaderRow.font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
  turmaHeaderRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2E75B6" } };
  const turmaSubHeaderRow = sheet.addRow(["Turma", "Média de Horas", "Total de Alunos"]);
  turmaSubHeaderRow.font = { bold: true };
  turmaSubHeaderRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E1F2" } };
  mediaPorTurma.forEach(t => sheet.addRow([t.turma, t.mediaHoras, t.totalAlunos]));
  const borderStyle = { top: { style: "thin", color: { argb: "FFD3D3D3" } }, left: { style: "thin", color: { argb: "FFD3D3D3" } },
    bottom: { style: "thin", color: { argb: "FFD3D3D3" } }, right: { style: "thin", color: { argb: "FFD3D3D3" } } };
  sheet.eachRow(row => row.eachCell(cell => cell.border = borderStyle));
  const fileName = `relatorio-horas-${Date.now()}.xlsx`;
  const filePath = resolveStoragePath(fileName);
  await workbook.xlsx.writeFile(filePath);
  const fileStats = await stat(filePath);
  const relatorioId = await salvarRelatorio({ tipo: 'excel', arquivo_nome: fileName, arquivo_path: filePath, tamanho_bytes: fileStats.size,
    filtros, estatisticas: { totalAlunos: alunos.length, turmas: mediaPorTurma.length }, criado_por: usuario || 'system' });
  return { fileName, filePath, relatorioId, tipo: 'excel' };
}

export async function gerarRelatorioHorasPdf({ filtros = {}, usuario } = {}) {
  const rows = await buscarRelatorio(filtros);
  if (!rows || rows.length === 0) {
    throw new Error("Nenhum dado encontrado para relatório de horas (PDF)");
  }
  const alunos = aggregateByAluno(rows);
  const turmaMap = new Map();
  alunos.forEach(a => {
    if (!turmaMap.has(a.turma)) turmaMap.set(a.turma, { totalSec: 0, count: 0 });
    const turmaData = turmaMap.get(a.turma);
    turmaData.totalSec += timeToSec(a.total);
    turmaData.count++;
  });
  const mediaPorTurma = Array.from(turmaMap.entries()).map(([turma, data]) => ({ turma, mediaHoras: secToHHMMSS(Math.floor(data.totalSec / data.count)), totalAlunos: data.count }));
  const fileName = `relatorio-horas-${Date.now()}.pdf`;
  const filePath = resolveStoragePath(fileName);
  const doc = new PDFDocument({ margin: 30, size: "A4", layout: "landscape" });
  const stream = createWriteStream(filePath);
  doc.pipe(stream);

  const logoPath = path.join(__dirname, '..', 'assets', 'images', 'academy-2.png');
  if (existsSync(logoPath)) {
    const logoWidth = 100;
    doc.image(logoPath, 30, 20, { width: logoWidth });
  }

  doc.fontSize(16).font("Helvetica-Bold").text("Relatório de Horas por Aluno", { align: "center" }).moveDown(0.5);
  doc.fontSize(10).font("Helvetica").text(`Total de Alunos: ${alunos.length} | Turmas: ${mediaPorTurma.length}`, { align: "center" }).moveDown(1);

  const pageWidth = 842;
  const margin = 10;
  const tableTop = 110;
  const rowHeight = 20;

  const colWidths = [120, 140, 80, 70, 70, 60, 60, 80, 70, 72];
  const headers = ["Aluno", "Turma", "Total Horas", "H.Real", "H.Sim", "% R", "% S", "Atividades", "Presenças", "Freq%"]; 
  const totalWidth = colWidths.reduce((a, b) => a + b, 0);

  const startX = margin;

  const drawHeaders = (yPos) => {
    doc.rect(startX, yPos, totalWidth, rowHeight).fillAndStroke("#4472C4", "#000000");
    let x = startX;
    headers.forEach((h, i) => {
      doc.font("Helvetica-Bold").fontSize(8).fillColor("#FFFFFF").text(h, x + 3, yPos + 6, { width: colWidths[i] - 6, align: "center" });
      x += colWidths[i];
    });
  };

  let yPos = tableTop;
  drawHeaders(yPos);
  yPos += rowHeight;

  alunos.forEach((a, idx) => {
    if (idx % 2 === 0) {
      doc.rect(startX, yPos, totalWidth, rowHeight).fill("#F2F2F2");
    }

    doc.rect(startX, yPos, totalWidth, rowHeight).stroke("#CCCCCC");

    const rowData = [
      a.aluno.substring(0, 25),
      a.turma.substring(0, 30),
      a.total,
      a.total_real,
      a.total_simulada,
      a.distribuicao.pctReal + '%',
      a.distribuicao.pctSimulada + '%',
      a.participacao.atividades,
      a.participacao.presencas,
      a.participacao.frequenciaPct + '%'
    ];

    let x = startX;
    rowData.forEach((val, i) => {
      doc.font("Helvetica").fontSize(7).fillColor("#000000").text(
        String(val),
        x + 3,
        yPos + 6,
        { width: colWidths[i] - 6, align: i < 2 ? "left" : "center" }
      );
      if (i < colWidths.length - 1) {
        doc.moveTo(x + colWidths[i], yPos).lineTo(x + colWidths[i], yPos + rowHeight).stroke("#CCCCCC");
      }
      x += colWidths[i];
    });

    yPos += rowHeight;

    if (yPos > 520 && idx < alunos.length - 1) {
      doc.addPage({ margin: 30, size: "A4", layout: "landscape" });
      yPos = 50;
      drawHeaders(yPos);
      yPos += rowHeight;
    }
  });

  doc.end();
  await new Promise((resolve, reject) => { stream.on("finish", resolve); stream.on("error", reject); });
  const fileStats = await stat(filePath);
  const relatorioId = await salvarRelatorio({ tipo: 'pdf', arquivo_nome: fileName, arquivo_path: filePath, tamanho_bytes: fileStats.size,
    filtros, estatisticas: { totalAlunos: alunos.length, turmas: mediaPorTurma.length }, criado_por: usuario || 'system' });
  return { fileName, filePath, relatorioId, tipo: 'pdf' };
}

export async function gerarRelatorioNotasExcel({ filtros = {}, usuario } = {}) {
  const rows = await buscarRelatorioNotas(filtros);
  if (!rows || rows.length === 0) {
    throw new Error("Nenhum dado encontrado para relatório de notas (Excel)");
  }
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Notas por Atividade");
  sheet.columns = [
    { header: "Aluno", key: "aluno", width: 30 },
    { header: "Email", key: "email", width: 35 },
    { header: "Turma", key: "turma", width: 20 },
    { header: "Atividade", key: "atividade", width: 30 },
    { header: "Tipo", key: "tipo", width: 15 },
    { header: "Nota", key: "nota", width: 10 },
    { header: "Conceito", key: "conceito", width: 12 },
    { header: "Status", key: "status", width: 12 },
    { header: "Status Avaliação", key: "status_avaliacao", width: 16 },
    { header: "Presença", key: "presenca", width: 12 },
    { header: "Professores", key: "professores", width: 30 },
  ];
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };
  headerRow.height = 25;
  rows.forEach((r, idx) => {
    const row = sheet.addRow({
      aluno: r.aluno,
      email: r.email,
      turma: r.turma,
      atividade: r.atividade,
      tipo: r.atividade_tipo || 'N/A',
      nota: r.nota !== null && r.nota !== undefined ? r.nota : 'Pendente',
      conceito: r.conceito || 'N/A',
      status: r.status,
      status_avaliacao: r.status_avaliacao || 'N/A',
      presenca: r.presenca ? 'Presente' : 'Ausente',
      professores: r.professores || 'N/A',
    });
    if (idx % 2 === 0) row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F2F2" } };
    row.eachCell(cell => cell.alignment = { horizontal: "center", vertical: "middle" });
    if (r.status === "Aprovado") {
      row.getCell('status').fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC6EFCE" } };
    } else if (r.status === "Reprovado") {
      row.getCell('status').fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFC7CE" } };
    }
  });
  sheet.addRow([]);
  sheet.addRow([]);
  const alunos = aggregateByAlunoNotas(rows);
  const statsHeaderRow = sheet.addRow(["Resumo por Aluno"]);
  statsHeaderRow.font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
  statsHeaderRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2E75B6" } };
  const statsSubHeaderRow = sheet.addRow(["Aluno", "Turma", "Média", "Nota Mín", "Nota Máx", "Total Notas", "Aprovações", "Reprovações", "Freq%"]); 
  statsSubHeaderRow.font = { bold: true };
  statsSubHeaderRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E1F2" } };
  alunos.forEach(a => {
    const alunoRows = rows.filter(r => r.aluno_id === a.aluno_id);
    const aprovacoes = alunoRows.filter(r => r.status === "Aprovado").length;
    const reprovacoes = alunoRows.filter(r => r.status === "Reprovado").length;
    sheet.addRow([a.aluno, a.turma, a.mediaNotas !== null ? a.mediaNotas : 'N/A', a.notaMin !== null ? a.notaMin : 'N/A',
      a.notaMax !== null ? a.notaMax : 'N/A', a.totalNotas, aprovacoes, reprovacoes, a.frequenciaPct + '%']);
  });
  const borderStyle = { top: { style: "thin", color: { argb: "FFD3D3D3" } }, left: { style: "thin", color: { argb: "FFD3D3D3" } },
    bottom: { style: "thin", color: { argb: "FFD3D3D3" } }, right: { style: "thin", color: { argb: "FFD3D3D3" } } };
  sheet.eachRow(row => row.eachCell(cell => cell.border = borderStyle));
  const fileName = `relatorio-notas-${Date.now()}.xlsx`;
  const filePath = resolveStoragePath(fileName);
  await workbook.xlsx.writeFile(filePath);
  const fileStats = await stat(filePath);
  const relatorioId = await salvarRelatorio({ tipo: 'excel', arquivo_nome: fileName, arquivo_path: filePath, tamanho_bytes: fileStats.size,
    filtros, estatisticas: { totalParticipacoes: rows.length, totalAlunos: alunos.length }, criado_por: usuario || 'system' });
  return { fileName, filePath, relatorioId, tipo: 'excel' };
}

export async function gerarRelatorioNotasPdf({ filtros = {}, usuario } = {}) {
  const rows = await buscarRelatorioNotas(filtros);
  if (!rows || rows.length === 0) {
    throw new Error("Nenhum dado encontrado para relatório de notas (PDF)");
  }
  const alunos = aggregateByAlunoNotas(rows);
  const fileName = `relatorio-notas-${Date.now()}.pdf`;
  const filePath = resolveStoragePath(fileName);
  const doc = new PDFDocument({ margin: 30, size: "A4", layout: "landscape" });
  const stream = createWriteStream(filePath);
  doc.pipe(stream);

  const pageWidth = 842;

  const logoPath = path.join(__dirname, '..', 'assets', 'images', 'academy-2.png');
  if (existsSync(logoPath)) {
    const logoWidth = 100;
    doc.image(logoPath, (pageWidth - logoWidth) / 30, 20, { width: logoWidth });
  }

  doc.fontSize(16).font("Helvetica-Bold").text("Relatório de Notas por Atividade", 0, 80, { align: "center" }).moveDown(0.5);
  doc.fontSize(10).font("Helvetica").text(`Total de Participações: ${rows.length} | Total de Alunos: ${alunos.length}`, { align: "center" }).moveDown(1);

  const margin = 30;
  const tableTop = 130;
  const rowHeight = 20;

  const colWidths = [130, 180, 100, 80, 90, 80, 82, 80];
  const headers = ["Aluno", "Atividade", "Tipo", "Nota", "Conceito", "Status", "Turma", "Pres."];
  const totalWidth = colWidths.reduce((a, b) => a + b, 0);

  const startX = (pageWidth - totalWidth) / 2;

  const drawHeaders = (yPos) => {
    doc.rect(startX, yPos, totalWidth, rowHeight).fillAndStroke("#4472C4", "#000000");
    let x = startX;
    headers.forEach((h, i) => {
      doc.font("Helvetica-Bold").fontSize(8).fillColor("#FFFFFF").text(h, x + 3, yPos + 6, { width: colWidths[i] - 6, align: "center" });
      x += colWidths[i];
    });
  };

  let yPos = tableTop;
  drawHeaders(yPos);
  yPos += rowHeight;

  rows.forEach((r, idx) => {
    if (yPos > 520) {
      doc.addPage({ margin: 30, size: "A4", layout: "landscape" });
      yPos = 50;
      drawHeaders(yPos);
      yPos += rowHeight;
    }

    if (idx % 2 === 0) {
      doc.rect(startX, yPos, totalWidth, rowHeight).fill("#F2F2F2");
    }

    doc.rect(startX, yPos, totalWidth, rowHeight).stroke("#CCCCCC");

    const rowData = [
      r.aluno.substring(0, 30),
      r.atividade.substring(0, 40),
      r.atividade_tipo ? r.atividade_tipo.substring(0, 15) : 'N/A',
      r.nota !== null && r.nota !== undefined ? r.nota : 'Pend',
      r.conceito ? r.conceito.substring(0, 12) : 'N/A',
      r.status.substring(0, 12),
      r.turma.substring(0, 20),
      r.presenca ? 'Sim' : 'Não'
    ];

    let x = startX;
    rowData.forEach((val, i) => {
      doc.font("Helvetica").fontSize(7).fillColor("#000000").text(String(val), x + 3, yPos + 6, { width: colWidths[i] - 6, align: i < 2 ? "left" : "center" });
      if (i < colWidths.length - 1) {
        doc.moveTo(x + colWidths[i], yPos).lineTo(x + colWidths[i], yPos + rowHeight).stroke("#CCCCCC");
      }
      x += colWidths[i];
    });
    yPos += rowHeight;
  });
  doc.end();
  await new Promise((resolve, reject) => { stream.on("finish", resolve); stream.on("error", reject); });
  const fileStats = await stat(filePath);
  const relatorioId = await salvarRelatorio({ tipo: 'pdf', arquivo_nome: fileName, arquivo_path: filePath, tamanho_bytes: fileStats.size,
    filtros, estatisticas: { totalParticipacoes: rows.length, totalAlunos: alunos.length }, criado_por: usuario || 'system' });
  return { fileName, filePath, relatorioId, tipo: 'pdf' };
}
