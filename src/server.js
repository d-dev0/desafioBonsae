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
    const it = map.get(r.aluno_id) || { aluno_id: r.aluno_id, aluno: r.aluno, email: r.email, turma: r.turma, atividades: 0, presencas: 0, totalHorasSec: 0 };
    it.atividades++;
    if (r.presenca) it.presencas++;
    it.totalHorasSec += timeToSec(r.horas);
    map.set(r.aluno_id, it);
  });
  
  return Array.from(map.values()).map(a => {
    const [realSec, simSec] = [a.totalHorasSec * 0.6, a.totalHorasSec * 0.4].map(Math.floor);
    const [acts_r, shifts_r, pract_r, certs_r] = [0.4, 0.25, 0.2, 0.15].map(p => Math.floor(realSec * p));
    const [acts_s, pract_s, certs_s] = [0.5, 0.35, 0.15].map(p => Math.floor(simSec * p));
    
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
  const { turma_id, professor_id, atividade_id, presenca, conceito, status } = filtros;
  const params = [], where = [];
  
  let query = `SELECT a.id AS aluno_id, a.nome AS aluno, a.email, t.nome AS turma, atv.nome AS atividade,
    p.nota, p.conceito, p.presenca, p.horas, string_agg(DISTINCT prof.nome, ', ') AS professores
    FROM participacoes p JOIN alunos a ON a.id = p.aluno_id JOIN turmas t ON t.id = p.turma_id
    JOIN atividades atv ON atv.id = p.atividade_id LEFT JOIN professor_turma pt ON pt.turma_id = t.id
    LEFT JOIN professores prof ON prof.id = pt.professor_id`;

  if (turma_id) { params.push(turma_id); where.push(`t.id = $${params.length}`); }
  if (professor_id) { params.push(professor_id); where.push(`prof.id = $${params.length}`); }
  if (atividade_id) { params.push(atividade_id); where.push(`atv.id = $${params.length}`); }
  if (presenca !== undefined && presenca !== "") {
    params.push(presenca === "Presente" || presenca === "true" || presenca === true);
    where.push(`p.presenca = $${params.length}`);
  }
  if (conceito) { params.push(conceito); where.push(`p.conceito = $${params.length}`); }
  
  if (where.length) query += " WHERE " + where.join(" AND ");
  query += ` GROUP BY a.id, t.id, atv.id, p.id ORDER BY a.nome`;
  
  const result = await pool.query(query, params);
  result.rows.forEach(r => r.status = r.nota === null ? "Pendente" : Number(r.nota) >= 6 ? "Aprovado" : "Reprovado");
  return status ? result.rows.filter(r => r.status === status) : result.rows;
};

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
const calcEstatisticas = (rows, alunos) => {
  const notasValidas = rows.map(r => parseFloat(r.nota)).filter(n => !isNaN(n));
  return {
    total: rows.length, alunosUnicos: alunos.length,
    mediaNotas: notasValidas.length ? notasValidas.reduce((s, n) => s + n, 0) / notasValidas.length : 0,
    frequencia: rows.length ? (rows.filter(r => r.presenca).length / rows.length) * 100 : 0
  };
};

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

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };
    headerRow.height = 25;

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

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=${fileName}`);
    res.send(await readFile(filePath));
  } catch (err) {
    console.error("Erro /download/excel:", err);
    if (!res.headersSent) res.status(500).send("Erro ao gerar Excel: " + err.message);
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