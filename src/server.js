import express from "express";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { fileURLToPath } from "url";
import path from "path";
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import { pool } from "./db.js";
import { salvarRelatorio, listarRelatorios, buscarRelatorioSalvo, registrarDownload, removerRelatorio, ensureStorageDir, resolveStoragePath } from "./storage.js";
import { writeFile, stat, readFile } from "fs/promises";
import { createWriteStream } from "fs";

const app = express();
const port = process.env.PORT || 3000;

// util (se quiser usar caminhos relativos mais tarde)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Middlewares ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS simples para permitir chamadas de front-ends separados (ajuste em produção)
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// --- Swagger/OpenAPI ---
const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'API de Relatórios',
    version: '1.0.0',
    description: 'API que gera relatórios, exporta Excel/PDF e fornece estatísticas.',
  },
  servers: [
    {
      url: `http://localhost:${port}`,
      description: 'Servidor local',
    },
  ],
};

const options = {
  definition: swaggerDefinition,
  // inclui este mesmo arquivo para que o swagger-jsdoc leia os comentários @openapi
  apis: [__filename],
};

const swaggerSpec = swaggerJsdoc(options);

// Documentação (UI)
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Pool Postgres centralizado importado de ./db.js

const timeToSec = (t) => {
  if (!t) return 0;
  const [h = 0, m = 0, s = 0] = String(t).split(":").map(Number);
  return h * 3600 + m * 60 + s;
};

const secToHHMMSS = (sec) => {
  const s = Math.max(0, Math.floor(sec));
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60]
    .map(v => String(v).padStart(2, '0')).join(':');
};

const aggregateByAluno = (rows) => {
  const map = new Map();
  rows.forEach(r => {
<<<<<<< HEAD
    const it = map.get(r.aluno_id) || { aluno_id: r.aluno_id, aluno: r.aluno, email: r.email, turma: r.turma, atividades: 0, presencas: 0, totalHorasSec: 0, notas: [] };
    it.atividades++;
    if (r.presenca) it.presencas++;
    it.totalHorasSec += timeToSec(r.horas);
    if (r.nota !== null && r.nota !== undefined) {
      it.notas.push(parseFloat(r.nota));
    }
=======
    const it = map.get(r.aluno_id) || { aluno_id: r.aluno_id, aluno: r.aluno, email: r.email, turma: r.turma, atividades: 0, presencas: 0, totalHorasSec: 0 };
    it.atividades++;
    if (r.presenca) it.presencas++;
    it.totalHorasSec += timeToSec(r.horas);
>>>>>>> c130962e81cd73c71255fe610c9e66bc24bca1c9
    map.set(r.aluno_id, it);
  });
  
  return Array.from(map.values()).map(a => {
    const [realSec, simSec] = [a.totalHorasSec * 0.6, a.totalHorasSec * 0.4].map(Math.floor);
    const [acts_r, shifts_r, pract_r, certs_r] = [0.4, 0.25, 0.2, 0.15].map(p => Math.floor(realSec * p));
    const [acts_s, pract_s, certs_s] = [0.5, 0.35, 0.15].map(p => Math.floor(simSec * p));
<<<<<<< HEAD
    const mediaNotas = a.notas.length > 0 ? a.notas.reduce((sum, n) => sum + n, 0) / a.notas.length : null;
=======
>>>>>>> c130962e81cd73c71255fe610c9e66bc24bca1c9
    
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
<<<<<<< HEAD
      mediaNotas: mediaNotas !== null ? +mediaNotas.toFixed(2) : null,
      totalNotas: a.notas.length,
=======
>>>>>>> c130962e81cd73c71255fe610c9e66bc24bca1c9
    };
  }).sort((a, b) => a.aluno_id - b.aluno_id);
};

// --- Health / root ---
/**
 * @openapi
 * /:
 *   get:
 *     summary: Health check
 *     responses:
 *       200:
 *         description: API running
 */
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "API de relatórios rodando" });
});

const buscarRelatorio = async (filtros = {}) => {
<<<<<<< HEAD
  const { turma_id, professor_id, atividade_id, aluno_id, presenca, conceito, status } = filtros;
  const params = [], where = [];
  
  let query = `SELECT a.id AS aluno_id, a.nome AS aluno, a.email, 
    t.id AS turma_id, t.nome AS turma, 
    atv.id AS atividade_id, atv.nome AS atividade, atv.tipo AS atividade_tipo,
    p.nota, p.conceito, p.presenca, p.horas, p.status_avaliacao,
    string_agg(DISTINCT prof.nome, ', ') AS professores
=======
  const { turma_id, professor_id, atividade_id, presenca, conceito, status } = filtros;
  const params = [], where = [];
  
  let query = `SELECT a.id AS aluno_id, a.nome AS aluno, a.email, t.nome AS turma, atv.nome AS atividade,
    p.nota, p.conceito, p.presenca, p.horas, string_agg(DISTINCT prof.nome, ', ') AS professores
>>>>>>> c130962e81cd73c71255fe610c9e66bc24bca1c9
    FROM participacoes p JOIN alunos a ON a.id = p.aluno_id JOIN turmas t ON t.id = p.turma_id
    JOIN atividades atv ON atv.id = p.atividade_id LEFT JOIN professor_turma pt ON pt.turma_id = t.id
    LEFT JOIN professores prof ON prof.id = pt.professor_id`;

  if (turma_id) { params.push(turma_id); where.push(`t.id = $${params.length}`); }
<<<<<<< HEAD
  if (aluno_id) { params.push(aluno_id); where.push(`a.id = $${params.length}`); }
=======
>>>>>>> c130962e81cd73c71255fe610c9e66bc24bca1c9
  if (professor_id) { params.push(professor_id); where.push(`prof.id = $${params.length}`); }
  if (atividade_id) { params.push(atividade_id); where.push(`atv.id = $${params.length}`); }
  if (presenca !== undefined && presenca !== "") {
    params.push(presenca === "Presente" || presenca === "true" || presenca === true);
    where.push(`p.presenca = $${params.length}`);
  }
  if (conceito) { params.push(conceito); where.push(`p.conceito = $${params.length}`); }
  
  if (where.length) query += " WHERE " + where.join(" AND ");
<<<<<<< HEAD
  query += ` GROUP BY a.id, t.id, atv.id, p.id ORDER BY a.id, atv.id`;
=======
  query += ` GROUP BY a.id, t.id, atv.id, p.id ORDER BY a.nome`;
>>>>>>> c130962e81cd73c71255fe610c9e66bc24bca1c9
  
  const result = await pool.query(query, params);
  result.rows.forEach(r => r.status = r.nota === null ? "Pendente" : Number(r.nota) >= 6 ? "Aprovado" : "Reprovado");
  return status ? result.rows.filter(r => r.status === status) : result.rows;
};

<<<<<<< HEAD
// Função específica para relatório de notas (sem horas)
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

// Agregação específica para notas (sem horas)
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

// Função auxiliar para cálculo de estatísticas
=======
// --- Rota que retorna JSON com o relatório e estatísticas ---
/**
 * @openapi
 * /relatorio:
 *   post:
 *     tags:
 *       - Relatórios JSON
 *     summary: Gera relatório com filtros e retorna estatísticas em JSON
 *     description: Retorna dados agregados dos alunos com estatísticas completas (não gera arquivo)
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               turma_id:
 *                 type: integer
 *                 example: 1
 *               professor_id:
 *                 type: integer
 *                 example: 1
 *               atividade_id:
 *                 type: integer
 *               presenca:
 *                 type: string
 *                 example: "true"
 *               conceito:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [Aprovado, Reprovado, Pendente]
 *     responses:
 *       200:
 *         description: Relatório gerado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 meta:
 *                   type: object
 *                   properties:
 *                     totalAlunos:
 *                       type: integer
 *                       example: 10
 *                     totalAtividades:
 *                       type: integer
 *                       example: 50
 *                     mediaNotas:
 *                       type: number
 *                       example: 7.5
 *                     frequencia:
 *                       type: number
 *                       example: 85.2
 *                 alunos:
 *                   type: array
 *                   items:
 *                     type: object
 *       500:
 *         description: Erro ao gerar relatório
 */
app.post("/relatorio", async (req, res) => {
  try {
    const filtros = {
      turma_id: req.body.turma_id || req.body.turma || req.body.turmaId,
      professor_id: req.body.professor_id || req.body.professorId,
      atividade_id: req.body.atividade_id || req.body.atividadeId,
      presenca: req.body.presenca, conceito: req.body.conceito, status: req.body.status,
    };

    const rows = await buscarRelatorio(filtros);
    const notasValidas = rows.map(r => parseFloat(r.nota)).filter(n => !isNaN(n));
    const mediaNotas = notasValidas.length ? notasValidas.reduce((s, n) => s + n, 0) / notasValidas.length : 0;
    const total = rows.length;
    const alunos = aggregateByAluno(rows);
    const alunosUnicos = alunos.length;
    
    console.log(`[Relatório] Total: ${total}, Alunos: ${alunosUnicos}`);
    
    const [realSec, simSec] = [alunos.reduce((s, a) => s + timeToSec(a.total_real), 0), alunos.reduce((s, a) => s + timeToSec(a.total_simulada), 0)];
    const totalSec = realSec + simSec;

    res.json({
      meta: {
        totalAlunos: alunosUnicos,
        totalAtividades: total,
        mediaAtividadesPorAluno: alunosUnicos ? +(total / alunosUnicos).toFixed(1) : 0,
        mediaNotas: +mediaNotas.toFixed(2),
        frequencia: total ? +((rows.filter(r => r.presenca).length / total) * 100).toFixed(1) : 0,
        aprovados: rows.filter(r => r.status === "Aprovado").length,
        reprovados: rows.filter(r => r.status === "Reprovado").length,
        mediaHorasTurma: secToHHMMSS(alunosUnicos ? Math.floor(alunos.reduce((s, a) => s + timeToSec(a.total), 0) / alunosUnicos) : 0),
        distribuicaoHoras: {
          real: secToHHMMSS(realSec), simulada: secToHHMMSS(simSec),
          pctReal: totalSec ? +((realSec / totalSec) * 100).toFixed(1) : 0,
          pctSimulada: totalSec ? +((simSec / totalSec) * 100).toFixed(1) : 0,
        },
      },
      alunos,
      download_example: { excel: `/download/excel?${new URLSearchParams(req.body)}`, pdf: `/download/pdf?${new URLSearchParams(req.body)}` },
    });
  } catch (err) {
    console.error("Erro /relatorio:", err);
    res.status(500).json({ error: "Erro ao gerar relatório", message: err.message });
  }
});

// --- Download Excel ---
/**
 * @openapi
 * /download/excel:
 *   get:
 *     tags:
 *       - Gerar Relatórios
 *     summary: Gera e faz download do relatório em Excel
 *     description: Gera um novo relatório em formato Excel e salva automaticamente no banco de dados
 *     parameters:
 *       - in: query
 *         name: turma_id
 *         schema:
 *           type: integer
 *         description: ID da turma para filtrar
 *         example: 1
 *       - in: query
 *         name: professor_id
 *         schema:
 *           type: integer
 *         description: ID do professor para filtrar
 *         example: 1
 *       - in: query
 *         name: atividade_id
 *         schema:
 *           type: integer
 *         description: ID da atividade para filtrar
 *       - in: query
 *         name: presenca
 *         schema:
 *           type: string
 *         description: Filtrar por presença (Presente/true ou false)
 *       - in: query
 *         name: conceito
 *         schema:
 *           type: string
 *         description: Filtrar por conceito
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [Aprovado, Reprovado, Pendente]
 *         description: Filtrar por status
 *     responses:
 *       200:
 *         description: Arquivo Excel gerado e salvo
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema:
 *               type: string
 *               format: binary
 *       500:
 *         description: Erro ao gerar Excel
 */
>>>>>>> c130962e81cd73c71255fe610c9e66bc24bca1c9
const calcEstatisticas = (rows, alunos) => {
  const notasValidas = rows.map(r => parseFloat(r.nota)).filter(n => !isNaN(n));
  return {
    total: rows.length, alunosUnicos: alunos.length,
    mediaNotas: notasValidas.length ? notasValidas.reduce((s, n) => s + n, 0) / notasValidas.length : 0,
    frequencia: rows.length ? (rows.filter(r => r.presenca).length / rows.length) * 100 : 0
  };
};

<<<<<<< HEAD
// --- Download Relatório de Horas por Aluno (Excel) ---
/**
 * @openapi
 * /download/relatorio-horas-excel:
 *   get:
 *     tags:
 *       - Relatórios por Aluno
 *     summary: Gera relatório de horas por aluno em Excel
 *     description: |
 *       Relatório focado em horas com total por aluno, distribuição real vs simulada, média por turma e indicadores de participação
 *     parameters:
 *       - in: query
 *         name: professor_id
 *         schema:
 *           type: integer
 *         description: ID do professor para filtrar
 *       - in: query
 *         name: turma_id
 *         schema:
 *           type: integer
 *         description: ID da turma para filtrar
 *     responses:
 *       200:
 *         description: Arquivo Excel gerado
 *       404:
 *         description: Nenhum dado encontrado
 *       500:
 *         description: Erro ao gerar relatório
 */
app.get("/download/relatorio-horas-excel", async (req, res) => {
  try {
    const rows = await buscarRelatorio(req.query);
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: "Nenhum dado encontrado", message: "Não há dados que correspondam aos filtros informados.", filtros: req.query });
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
=======
app.get("/download/excel", async (req, res) => {
  try {
    const rows = await buscarRelatorio(req.query);
    const alunos = aggregateByAluno(rows);
    const { total, alunosUnicos, mediaNotas, frequencia } = calcEstatisticas(rows, alunos);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Relatório por Aluno");
    
    sheet.columns = [
      { header: "ID", key: "aluno_id", width: 8 }, { header: "Aluno", key: "aluno", width: 30 },
      { header: "Email", key: "email", width: 35 }, { header: "Turma", key: "turma", width: 20 },
      { header: "Total de Horas", key: "total", width: 15 }, { header: "Horas Reais", key: "total_real", width: 15 },
      { header: "Horas Simuladas", key: "total_simulada", width: 15 }, { header: "% Real", key: "pct_real", width: 10 },
      { header: "% Simulada", key: "pct_simulada", width: 12 }, { header: "Atividades (Real)", key: "atividades_real", width: 16 },
      { header: "Atividades (Sim)", key: "atividades_simulada", width: 16 }, { header: "Plantões", key: "plantoes", width: 15 },
      { header: "Práticas (Real)", key: "praticas_real", width: 16 }, { header: "Práticas (Sim)", key: "praticas_simulada", width: 16 },
      { header: "Certificados (Real)", key: "certificados_real", width: 18 }, { header: "Certificados (Sim)", key: "certificados_simulada", width: 18 },
      { header: "Atividades Participadas", key: "atividades", width: 22 }, { header: "Presenças", key: "presencas", width: 12 },
      { header: "Frequência %", key: "frequencia_pct", width: 13 },
    ];

>>>>>>> c130962e81cd73c71255fe610c9e66bc24bca1c9
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };
    headerRow.height = 25;
<<<<<<< HEAD
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
    await salvarRelatorio({ tipo: 'excel', arquivo_nome: fileName, arquivo_path: filePath, tamanho_bytes: fileStats.size,
      filtros: req.query, estatisticas: { totalAlunos: alunos.length, turmas: mediaPorTurma.length } });
=======

    alunos.forEach((a, idx) => {
      const row = sheet.addRow({
        aluno_id: a.aluno_id, aluno: a.aluno, email: a.email, turma: a.turma, total: a.total,
        total_real: a.total_real, total_simulada: a.total_simulada, pct_real: a.distribuicao.pctReal,
        pct_simulada: a.distribuicao.pctSimulada, atividades_real: a.horas_por_tipo.atividades_real,
        atividades_simulada: a.horas_por_tipo.atividades_simulada, plantoes: a.horas_por_tipo.plantoes,
        praticas_real: a.horas_por_tipo.praticas_real, praticas_simulada: a.horas_por_tipo.praticas_simulada,
        certificados_real: a.horas_por_tipo.certificados_real, certificados_simulada: a.horas_por_tipo.certificados_simulada,
        atividades: a.participacao.atividades, presencas: a.participacao.presencas, frequencia_pct: a.participacao.frequenciaPct,
      });
      if (idx % 2 === 0) row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F2F2" } };
      for (let i = 5; i <= 19; i++) row.getCell(i).alignment = { horizontal: "center", vertical: "middle" };
      [2, 3, 4].forEach(i => row.getCell(i).alignment = { horizontal: "left", vertical: "middle" });
    });

    const borderStyle = { top: { style: "thin", color: { argb: "FFD3D3D3" } }, left: { style: "thin", color: { argb: "FFD3D3D3" } },
      bottom: { style: "thin", color: { argb: "FFD3D3D3" } }, right: { style: "thin", color: { argb: "FFD3D3D3" } } };
    sheet.eachRow(row => row.eachCell(cell => cell.border = borderStyle));

    const fileName = `relatorio-${Date.now()}.xlsx`;
    const filePath = resolveStoragePath(fileName);
    await workbook.xlsx.writeFile(filePath);
    const fileStats = await stat(filePath);
    
    await salvarRelatorio({
      tipo: 'excel', arquivo_nome: fileName, arquivo_path: filePath, tamanho_bytes: fileStats.size,
      filtros: req.query, estatisticas: { totalAlunos: alunosUnicos, totalAtividades: total, mediaNotas: +mediaNotas.toFixed(2), frequencia: +frequencia.toFixed(1) }
    });

>>>>>>> c130962e81cd73c71255fe610c9e66bc24bca1c9
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=${fileName}`);
    res.send(await readFile(filePath));
  } catch (err) {
<<<<<<< HEAD
    console.error("Erro /download/relatorio-horas-excel:", err);
    if (!res.headersSent) res.status(500).send("Erro ao gerar relatório de horas: " + err.message);
  }
});

// --- Download Relatório de Horas por Aluno (PDF) ---
/**
 * @openapi
 * /download/relatorio-horas-pdf:
 *   get:
 *     tags:
 *       - Relatórios por Aluno
 *     summary: Gera relatório de horas por aluno em PDF
 *     description: |
 *       Relatório focado em horas com total por aluno, distribuição real vs simulada, média por turma e indicadores de participação
 *     parameters:
 *       - in: query
 *         name: professor_id
 *         schema:
 *           type: integer
 *         description: ID do professor para filtrar
 *       - in: query
 *         name: turma_id
 *         schema:
 *           type: integer
 *         description: ID da turma para filtrar
 *     responses:
 *       200:
 *         description: Arquivo PDF gerado
 *       404:
 *         description: Nenhum dado encontrado
 *       500:
 *         description: Erro ao gerar relatório
 */
app.get("/download/relatorio-horas-pdf", async (req, res) => {
  try {
    const rows = await buscarRelatorio(req.query);
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: "Nenhum dado encontrado", message: "Não há dados que correspondam aos filtros informados.", filtros: req.query });
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
    const doc = new PDFDocument({ margin: 10, size: "A4", layout: "landscape" });
    const stream = createWriteStream(filePath);
    doc.pipe(stream);
    doc.fontSize(14).font("Helvetica-Bold").text("Relatório de Horas por Aluno", { align: "center" }).moveDown(0.5);
    doc.fontSize(9).font("Helvetica").text(`Total de Alunos: ${alunos.length} | Turmas: ${mediaPorTurma.length}`, { align: "center" }).moveDown(0.5);
    const [startX, tableTop, rowHeight] = [10, 80, 18];
    const colWidths = [50, 80, 60, 50, 50, 40, 40, 50, 40, 40];
    const headers = ["Aluno", "Turma", "Total Horas", "H.Real", "H.Sim", "% R", "% S", "Atividades", "Presenças", "Freq%"];
    const totalWidth = colWidths.reduce((a, b) => a + b, 0);
    const drawHeaders = (yPos) => {
      doc.rect(startX, yPos - 2, totalWidth, rowHeight).fill("#4472C4");
      let x = startX;
      headers.forEach((h, i) => {
        doc.font("Helvetica-Bold").fontSize(7).fillColor("#FFFFFF").text(h, x + 2, yPos + 4, { width: colWidths[i] - 4, align: "center" });
        x += colWidths[i];
      });
      doc.fillColor("#000000");
    };
    let yPos = tableTop;
    drawHeaders(yPos);
    yPos += rowHeight;
    alunos.forEach((a, idx) => {
      if (yPos > 520) {
        doc.addPage({ margin: 10, size: "A4", layout: "landscape" });
        yPos = 40;
        drawHeaders(yPos);
        yPos += rowHeight;
      }
      if (idx % 2 === 0) doc.rect(startX, yPos - 2, totalWidth, rowHeight).fill("#F2F2F2");
      const rowData = [a.aluno.substring(0, 15), a.turma.substring(0, 20), a.total, a.total_real, a.total_simulada,
        a.distribuicao.pctReal + '%', a.distribuicao.pctSimulada + '%', a.participacao.atividades, a.participacao.presencas, a.participacao.frequenciaPct + '%'];
      let x = startX;
      rowData.forEach((val, i) => {
        doc.font("Helvetica").fontSize(6).fillColor("#000000").text(String(val), x + 2, yPos + 4, { width: colWidths[i] - 4, align: i < 2 ? "left" : "center" });
        x += colWidths[i];
      });
      yPos += rowHeight;
    });
    if (yPos > 450) { doc.addPage({ margin: 10, size: "A4", layout: "landscape" }); yPos = 40; }
    yPos += 20;
    doc.fontSize(12).font("Helvetica-Bold").fillColor("#000000").text("Média de Horas por Turma", startX, yPos);
    yPos += 20;
    mediaPorTurma.forEach(t => {
      doc.fontSize(9).font("Helvetica").text(`${t.turma}: ${t.mediaHoras} (${t.totalAlunos} alunos)`, startX, yPos);
      yPos += 15;
    });
    doc.end();
    await new Promise((resolve, reject) => { stream.on("finish", resolve); stream.on("error", reject); });
    const fileStats = await stat(filePath);
    await salvarRelatorio({ tipo: 'pdf', arquivo_nome: fileName, arquivo_path: filePath, tamanho_bytes: fileStats.size,
      filtros: req.query, estatisticas: { totalAlunos: alunos.length, turmas: mediaPorTurma.length } });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=${fileName}`);
    res.send(await readFile(filePath));
  } catch (err) {
    console.error("Erro /download/relatorio-horas-pdf:", err);
    if (!res.headersSent) res.status(500).send("Erro ao gerar relatório de horas: " + err.message);
  }
});

// --- Download Relatório de Notas por Atividade (Excel) ---
/**
 * @openapi
 * /download/relatorio-notas-excel:
 *   get:
 *     tags:
 *       - Relatórios por Aluno
 *     summary: Gera relatório de notas por atividade realizada por aluno em Excel
 *     description: |
 *       Relatório mostrando cada nota obtida pelo aluno em cada atividade realizada
 *     parameters:
 *       - in: query
 *         name: professor_id
 *         schema:
 *           type: integer
 *         description: ID do professor para filtrar
 *       - in: query
 *         name: turma_id
 *         schema:
 *           type: integer
 *         description: ID da turma para filtrar
 *     responses:
 *       200:
 *         description: Arquivo Excel gerado
 *       404:
 *         description: Nenhum dado encontrado
 *       500:
 *         description: Erro ao gerar relatório
 */
app.get("/download/relatorio-notas-excel", async (req, res) => {
  try {
    const rows = await buscarRelatorioNotas(req.query);
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: "Nenhum dado encontrado", message: "Não há dados que correspondam aos filtros informados.", filtros: req.query });
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
    console.error("Erro /download/relatorio-notas-excel:", err);
    if (!res.headersSent) res.status(500).send("Erro ao gerar relatório de notas: " + err.message);
  }
});

// --- Download Relatório de Notas por Atividade (PDF) ---
/**
 * @openapi
 * /download/relatorio-notas-pdf:
 *   get:
 *     tags:
 *       - Relatórios por Aluno
 *     summary: Gera relatório de notas por atividade realizada por aluno em PDF
 *     description: |
 *       Relatório mostrando cada nota obtida pelo aluno em cada atividade realizada
 *     parameters:
 *       - in: query
 *         name: professor_id
 *         schema:
 *           type: integer
 *         description: ID do professor para filtrar
 *       - in: query
 *         name: turma_id
 *         schema:
 *           type: integer
 *         description: ID da turma para filtrar
 *     responses:
 *       200:
 *         description: Arquivo PDF gerado
 *       404:
 *         description: Nenhum dado encontrado
 *       500:
 *         description: Erro ao gerar relatório
 */
app.get("/download/relatorio-notas-pdf", async (req, res) => {
  try {
    const rows = await buscarRelatorioNotas(req.query);
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: "Nenhum dado encontrado", message: "Não há dados que correspondam aos filtros informados.", filtros: req.query });
    }
    const alunos = aggregateByAlunoNotas(rows);
    const fileName = `relatorio-notas-${Date.now()}.pdf`;
    const filePath = resolveStoragePath(fileName);
    const doc = new PDFDocument({ margin: 10, size: "A4", layout: "landscape" });
    const stream = createWriteStream(filePath);
    doc.pipe(stream);
    doc.fontSize(14).font("Helvetica-Bold").text("Relatório de Notas por Atividade", { align: "center" }).moveDown(0.5);
    doc.fontSize(9).font("Helvetica").text(`Total de Participações: ${rows.length} | Total de Alunos: ${alunos.length}`, { align: "center" }).moveDown(0.5);
    const [startX, tableTop, rowHeight] = [10, 80, 18];
    const colWidths = [70, 100, 60, 40, 50, 40, 40, 40];
    const headers = ["Aluno", "Atividade", "Tipo", "Nota", "Conceito", "Status", "Turma", "Pres."];
    const totalWidth = colWidths.reduce((a, b) => a + b, 0);
    const drawHeaders = (yPos) => {
      doc.rect(startX, yPos - 2, totalWidth, rowHeight).fill("#4472C4");
      let x = startX;
      headers.forEach((h, i) => {
        doc.font("Helvetica-Bold").fontSize(7).fillColor("#FFFFFF").text(h, x + 2, yPos + 4, { width: colWidths[i] - 4, align: "center" });
        x += colWidths[i];
      });
      doc.fillColor("#000000");
    };
    let yPos = tableTop;
    drawHeaders(yPos);
    yPos += rowHeight;
    rows.forEach((r, idx) => {
      if (yPos > 520) {
        doc.addPage({ margin: 10, size: "A4", layout: "landscape" });
        yPos = 40;
        drawHeaders(yPos);
        yPos += rowHeight;
      }
      if (idx % 2 === 0) doc.rect(startX, yPos - 2, totalWidth, rowHeight).fill("#F2F2F2");
      const rowData = [
        r.aluno.substring(0, 20),
        r.atividade.substring(0, 25),
        r.atividade_tipo ? r.atividade_tipo.substring(0, 10) : 'N/A',
        r.nota !== null && r.nota !== undefined ? r.nota : 'Pend',
        r.conceito ? r.conceito.substring(0, 8) : 'N/A',
        r.status.substring(0, 8),
        r.turma.substring(0, 15),
        r.presenca ? 'Sim' : 'Não'
      ];
      let x = startX;
      rowData.forEach((val, i) => {
        doc.font("Helvetica").fontSize(6).fillColor("#000000").text(String(val), x + 2, yPos + 4, { width: colWidths[i] - 4, align: i < 2 ? "left" : "center" });
        x += colWidths[i];
      });
      yPos += rowHeight;
    });
    if (yPos > 450) { doc.addPage({ margin: 10, size: "A4", layout: "landscape" }); yPos = 40; }
    yPos += 20;
    doc.fontSize(12).font("Helvetica-Bold").fillColor("#000000").text("Resumo por Aluno", startX, yPos);
    yPos += 20;
    alunos.forEach(a => {
      const alunoRows = rows.filter(r => r.aluno_id === a.aluno_id);
      const aprovacoes = alunoRows.filter(r => r.status === "Aprovado").length;
      const reprovacoes = alunoRows.filter(r => r.status === "Reprovado").length;
      doc.fontSize(9).font("Helvetica").text(`${a.aluno} (${a.turma}): Média ${a.mediaNotas !== null ? a.mediaNotas.toFixed(2) : 'N/A'} | ${aprovacoes} aprovações | ${reprovacoes} reprovações`, startX, yPos);
      yPos += 15;
      if (yPos > 550) { doc.addPage({ margin: 10, size: "A4", layout: "landscape" }); yPos = 40; }
    });
    doc.end();
    await new Promise((resolve, reject) => { stream.on("finish", resolve); stream.on("error", reject); });
    const fileStats = await stat(filePath);
    await salvarRelatorio({ tipo: 'pdf', arquivo_nome: fileName, arquivo_path: filePath, tamanho_bytes: fileStats.size,
      filtros: req.query, estatisticas: { totalParticipacoes: rows.length, totalAlunos: alunos.length } });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=${fileName}`);
    res.send(await readFile(filePath));
  } catch (err) {
    console.error("Erro /download/relatorio-notas-pdf:", err);
    if (!res.headersSent) res.status(500).send("Erro ao gerar relatório de notas: " + err.message);
=======
    console.error("Erro /download/excel:", err);
    if (!res.headersSent) res.status(500).send("Erro ao gerar Excel: " + err.message);
>>>>>>> c130962e81cd73c71255fe610c9e66bc24bca1c9
  }
});

// --- Listar Relatórios Salvos ---
/**
 * @openapi
 * /relatorios/salvos:
 *   get:
 *     tags:
 *       - Relatórios Salvos
 *     summary: Lista todos os relatórios salvos
 *     description: Retorna lista completa de relatórios gerados com metadados, estatísticas e URL de download
 *     parameters:
 *       - in: query
 *         name: tipo
 *         schema:
 *           type: string
 *           enum: [excel, pdf]
 *         description: Filtrar por tipo de relatório
 *         example: excel
 *       - in: query
 *         name: limite
 *         schema:
 *           type: integer
 *         description: Limitar número de resultados
 *         example: 10
 *     responses:
 *       200:
 *         description: Lista de relatórios com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total:
 *                   type: integer
 *                   example: 2
 *                 relatorios:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                         example: 1
 *                       nome:
 *                         type: string
 *                         example: "Relatório Excel - 29/10/2025 17:30:45"
 *                       tipo:
 *                         type: string
 *                         example: excel
 *                       arquivo_nome:
 *                         type: string
 *                         example: relatorio-1730234445123.xlsx
 *                       tamanho_mb:
 *                         type: string
 *                         example: "0.05"
 *                       downloads:
 *                         type: integer
 *                         example: 3
 *                       criado_em:
 *                         type: string
 *                         format: date-time
 *                       url_download:
 *                         type: string
 *                         example: http://localhost:3000/relatorios/salvos/1/download
 *       500:
 *         description: Erro ao listar relatórios
 */
app.get("/relatorios/salvos", async (req, res) => {
  try {
    const relatorios = await listarRelatorios({ tipo: req.query.tipo, limite: req.query.limite ? parseInt(req.query.limite) : undefined });
    const formatados = relatorios.map(r => ({
      ...r, tamanho_mb: r.tamanho_bytes ? (r.tamanho_bytes / 1024 / 1024).toFixed(2) : null,
      url_download: `${req.protocol}://${req.get('host')}/relatorios/salvos/${r.id}/download`
    }));
    res.json({ total: formatados.length, relatorios: formatados });
  } catch (err) {
    console.error("Erro ao listar relatórios:", err);
    res.status(500).json({ error: "Erro ao listar relatórios", message: err.message });
  }
});

// --- Buscar Relatório Específico ---
/**
 * @openapi
 * /relatorios/salvos/{id}:
 *   get:
 *     tags:
 *       - Relatórios Salvos
 *     summary: Busca detalhes de um relatório específico
 *     description: Retorna informações completas sobre um relatório salvo incluindo filtros e estatísticas
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do relatório
 *         example: 1
 *     responses:
 *       200:
 *         description: Detalhes do relatório
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: integer
 *                   example: 1
 *                 nome:
 *                   type: string
 *                   example: "Relatório Excel - 29/10/2025 17:30:45"
 *                 tipo:
 *                   type: string
 *                   example: excel
 *                 arquivo_nome:
 *                   type: string
 *                   example: relatorio-1730234445123.xlsx
 *                 tamanho_mb:
 *                   type: string
 *                   example: "0.05"
 *                 filtros:
 *                   type: object
 *                   example: {"turma_id": "1"}
 *                 estatisticas:
 *                   type: object
 *                   example: {"totalAlunos": 10, "mediaNotas": 7.5}
 *                 downloads:
 *                   type: integer
 *                   example: 3
 *                 criado_em:
 *                   type: string
 *                   format: date-time
 *                 url_download:
 *                   type: string
 *                   example: http://localhost:3000/relatorios/salvos/1/download
 *       404:
 *         description: Relatório não encontrado
 *       500:
 *         description: Erro ao buscar relatório
 */
app.get("/relatorios/salvos/:id", async (req, res) => {
  try {
    const relatorio = await buscarRelatorioSalvo(parseInt(req.params.id));
    if (!relatorio) return res.status(404).json({ error: "Relatório não encontrado" });
    
    res.json({
      ...relatorio, tamanho_mb: relatorio.tamanho_bytes ? (relatorio.tamanho_bytes / 1024 / 1024).toFixed(2) : null,
      url_download: `${req.protocol}://${req.get('host')}/relatorios/salvos/${relatorio.id}/download`
    });
  } catch (err) {
    console.error("Erro ao buscar relatório:", err);
    res.status(500).json({ error: "Erro ao buscar relatório", message: err.message });
  }
});

// --- Download de Relatório Salvo ---
/**
 * @openapi
 * /relatorios/salvos/{id}/download:
 *   get:
 *     tags:
 *       - Relatórios Salvos
 *     summary: Faz download de um relatório salvo (sem regenerar)
 *     description: Baixa o arquivo do relatório que já foi gerado anteriormente. Incrementa o contador de downloads.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do relatório
 *         example: 1
 *     responses:
 *       200:
 *         description: Arquivo do relatório (Excel ou PDF)
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema:
 *               type: string
 *               format: binary
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Relatório não encontrado ou arquivo não existe no disco
 *       500:
 *         description: Erro ao baixar relatório
 */
app.get("/relatorios/salvos/:id/download", async (req, res) => {
  try {
    const relatorio = await buscarRelatorioSalvo(parseInt(req.params.id));
    if (!relatorio) return res.status(404).json({ error: "Relatório não encontrado" });
    
    try { await stat(relatorio.arquivo_path); } 
    catch { return res.status(404).json({ error: "Arquivo não encontrado no disco" }); }
    
    await registrarDownload(parseInt(req.params.id));
    const contentType = relatorio.tipo === 'excel' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf';
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename=${relatorio.arquivo_nome}`);
    res.send(await readFile(relatorio.arquivo_path));
  } catch (err) {
    console.error("Erro ao baixar relatório:", err);
    if (!res.headersSent) res.status(500).json({ error: "Erro ao baixar relatório", message: err.message });
  }
});

// --- Remover Relatório Salvo ---
/**
 * @openapi
 * /relatorios/salvos/{id}:
 *   delete:
 *     tags:
 *       - Relatórios Salvos
 *     summary: Remove um relatório salvo
 *     description: Remove o relatório do banco de dados e tenta remover o arquivo do disco
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do relatório a ser removido
 *         example: 1
 *     responses:
 *       200:
 *         description: Relatório removido com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Relatório removido com sucesso"
 *                 id:
 *                   type: integer
 *                   example: 1
 *       404:
 *         description: Relatório não encontrado
 *       500:
 *         description: Erro ao remover relatório
 */
app.delete("/relatorios/salvos/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const relatorio = await buscarRelatorioSalvo(id);
    if (!relatorio) return res.status(404).json({ error: "Relatório não encontrado" });
    
    try {
      const { unlink } = await import('fs/promises');
      await unlink(relatorio.arquivo_path);
    } catch (err) { console.warn(`Não foi possível remover arquivo: ${err.message}`); }
    
    const removido = await removerRelatorio(id);
    res.json(removido ? { success: true, message: "Relatório removido com sucesso", id } : { error: "Erro ao remover relatório do banco" });
  } catch (err) {
    console.error("Erro ao remover relatório:", err);
    res.status(500).json({ error: "Erro ao remover relatório", message: err.message });
  }
});

<<<<<<< HEAD
=======
// --- Download PDF ---
/**
 * @openapi
 * /download/pdf:
 *   get:
 *     tags:
 *       - Gerar Relatórios
 *     summary: Gera e faz download do relatório em PDF
 *     description: Gera um novo relatório em formato PDF e salva automaticamente no banco de dados
 *     parameters:
 *       - in: query
 *         name: turma_id
 *         schema:
 *           type: integer
 *         description: ID da turma para filtrar
 *         example: 1
 *       - in: query
 *         name: professor_id
 *         schema:
 *           type: integer
 *         description: ID do professor para filtrar
 *         example: 1
 *       - in: query
 *         name: atividade_id
 *         schema:
 *           type: integer
 *         description: ID da atividade para filtrar
 *       - in: query
 *         name: presenca
 *         schema:
 *           type: string
 *         description: Filtrar por presença (Presente/true ou false)
 *       - in: query
 *         name: conceito
 *         schema:
 *           type: string
 *         description: Filtrar por conceito
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [Aprovado, Reprovado, Pendente]
 *         description: Filtrar por status
 *     responses:
 *       200:
 *         description: Arquivo PDF gerado e salvo
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       500:
 *         description: Erro ao gerar PDF
 */
app.get("/download/pdf", async (req, res) => {
  try {
    const rows = await buscarRelatorio(req.query);
    const alunos = aggregateByAluno(rows);
    const { total, alunosUnicos, mediaNotas, frequencia } = calcEstatisticas(rows, alunos);

    const fileName = `relatorio-${Date.now()}.pdf`;
    const filePath = resolveStoragePath(fileName);
    const doc = new PDFDocument({ margin: 20, size: "A4", layout: "landscape" });
    const stream = createWriteStream(filePath);
    doc.pipe(stream);

    doc.fontSize(16).font("Helvetica-Bold").text("Relatório por Aluno", { align: "center" }).moveDown(0.5);

    const [startX, tableTop, rowHeight] = [20, 80, 20];
    const colWidths = [140, 90, 65, 65, 65, 50, 65, 65, 65];
    const headers = ["Aluno", "Turma", "Total", "Real", "Simulada", "% Real", "Atividades", "Presenças", "Freq %"];
    const totalWidth = colWidths.reduce((a, b) => a + b, 0);

    const drawHeaders = (yPos) => {
      doc.rect(startX, yPos - 2, totalWidth, rowHeight).fill("#4472C4");
      let x = startX;
      headers.forEach((h, i) => {
        doc.font("Helvetica-Bold").fontSize(9).fillColor("#FFFFFF").text(h, x + 2, yPos + 4, { width: colWidths[i] - 4, align: "center" });
        x += colWidths[i];
      });
      doc.fillColor("#000000");
    };

    drawHeaders(tableTop);
    let y = tableTop + rowHeight;

    alunos.forEach((a, idx) => {
      doc.rect(startX, y - 2, totalWidth, rowHeight).fill(idx % 2 === 0 ? "#F2F2F2" : "#FFFFFF");
      let x = startX;
      [a.aluno.substring(0, 20), a.turma.substring(0, 15), a.total, a.total_real, a.total_simulada,
       a.distribuicao.pctReal.toFixed(1) + "%", String(a.participacao.atividades),
       String(a.participacao.presencas), a.participacao.frequenciaPct.toFixed(1) + "%"
      ].forEach((val, i) => {
        doc.font("Helvetica").fontSize(8).fillColor("#000000").text(String(val), x + 2, y + 4, { width: colWidths[i] - 4, align: i < 2 ? "left" : "center" });
        x += colWidths[i];
      });
      y += rowHeight;
      if (y > 520) { doc.addPage({ size: "A4", layout: "landscape", margin: 20 }); y = 40; drawHeaders(y); y += rowHeight; }
    });

    doc.end();
    await new Promise((resolve, reject) => { stream.on('finish', resolve); stream.on('error', reject); });

    await salvarRelatorio({
      tipo: 'pdf', arquivo_nome: fileName, arquivo_path: filePath, tamanho_bytes: (await stat(filePath)).size,
      filtros: req.query, estatisticas: { totalAlunos: alunosUnicos, totalAtividades: total, mediaNotas: +mediaNotas.toFixed(2), frequencia: +frequencia.toFixed(1) }
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=${fileName}`);
    res.send(await readFile(filePath));
  } catch (err) {
    console.error("Erro /download/pdf:", err);
    if (!res.headersSent) res.status(500).send("Erro ao gerar PDF: " + err.message);
  }
});

>>>>>>> c130962e81cd73c71255fe610c9e66bc24bca1c9
// --- Start ---
app.listen(port, async () => {
  await ensureStorageDir();
  console.log(`Servidor rodando em http://localhost:${port}`);
  console.log(`Swagger UI disponível em http://localhost:${port}/docs`);
});

// captura erros não tratados pra facilitar debug
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});