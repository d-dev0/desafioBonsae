import express from "express";
import pkg from "pg";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { fileURLToPath } from "url";
import path from "path";
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';

const { Pool } = pkg;
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

// --- Pool Postgres (use variáveis de ambiente no Docker) ---
const pool = new Pool({
  user: process.env.PGUSER || "postgres",
  host: process.env.PGHOST || "localhost",
  database: process.env.PGDATABASE || "residencia",
  password: process.env.PGPASSWORD || "postgres",
  port: process.env.PGPORT ? parseInt(process.env.PGPORT) : 5432,
});

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

// --- Função utilitária para montar e executar a query de relatório ---
async function buscarRelatorio(filtros = {}) {
  const { turma_id, professor_id, atividade_id, presenca, conceito, status } = filtros;

  // query base
  let params = [];
  let where = [];

  let query = `
    SELECT a.nome AS aluno, a.email, t.nome AS turma, atv.nome AS atividade,
           p.nota, p.conceito, p.presenca, p.horas,
           string_agg(DISTINCT prof.nome, ', ') AS professores
    FROM participacoes p
    JOIN alunos a ON a.id = p.aluno_id
    JOIN turmas t ON t.id = p.turma_id
    JOIN atividades atv ON atv.id = p.atividade_id
    LEFT JOIN professor_turma pt ON pt.turma_id = t.id
    LEFT JOIN professores prof ON prof.id = pt.professor_id
  `;

  if (turma_id) {
    params.push(turma_id);
    where.push(`t.id = $${params.length}`);
  }
  if (professor_id) {
    params.push(professor_id);
    where.push(`prof.id = $${params.length}`);
  }
  if (atividade_id) {
    params.push(atividade_id);
    where.push(`atv.id = $${params.length}`);
  }
  if (typeof presenca !== "undefined" && presenca !== "") {
    const val = presenca === "Presente" || presenca === "true" || presenca === true;
    params.push(val);
    where.push(`p.presenca = $${params.length}`);
  }
  if (conceito) {
    params.push(conceito);
    where.push(`p.conceito = $${params.length}`);
  }

  if (where.length) {
    query += " WHERE " + where.join(" AND ");
  }

  query += ` GROUP BY a.id, t.id, atv.id, p.id ORDER BY a.nome`;

  const result = await pool.query(query, params);

  // determina status por linha
  result.rows.forEach(r => {
    if (r.nota === null) {
      r.status = "Pendente";
    } else if (Number(r.nota) >= 6) {
      r.status = "Aprovado";
    } else {
      r.status = "Reprovado";
    }
  });

  // filtra por status se foi pedido
  return status ? result.rows.filter(r => r.status === status) : result.rows;
}

// --- Rota que retorna JSON com o relatório e estatísticas ---
/**
 * @openapi
 * /relatorio:
 *   post:
 *     summary: Gera relatório com filtros e retorna estatísticas
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               turma_id (1):
 *                 type: integer
 *               professor_id (1 or 2):
 *                 type: integer
 *               atividade_id:
 *                 type: integer
 *               presenca:
 *                 type: string
 *               conceito:
 *                 type: string
 *               status:
 *                 type: string
 *     responses:
 *       200:
 *         description: Relatório gerado
 */
app.post("/relatorio", async (req, res) => {
  try {
    const filtros = {
      turma_id: req.body.turma_id || req.body.turma || req.body.turmaId,
      professor_id: req.body.professor_id || req.body.professorId,
      atividade_id: req.body.atividade_id || req.body.atividadeId,
      presenca: req.body.presenca,
      conceito: req.body.conceito,
      status: req.body.status,
    };

    const rows = await buscarRelatorio(filtros);

    const notasValidas = rows
      .map(r => (typeof r.nota === "number" ? r.nota : parseFloat(r.nota)))
      .filter(n => !Number.isNaN(n));

    const mediaNotas = notasValidas.length ? notasValidas.reduce((s, n) => s + n, 0) / notasValidas.length : 0;

    const total = rows.length;
    const frequencia = total ? (rows.filter(r => r.presenca).length / total) * 100 : 0;
    const aprovados = rows.filter(r => r.status === "Aprovado").length;
    const reprovados = rows.filter(r => r.status === "Reprovado").length;

    res.json({
      meta: {
        total,
        mediaNotas: Number(mediaNotas.toFixed(2)),
        frequencia: Number(frequencia.toFixed(1)),
        aprovados,
        reprovados,
      },
      rows,
      download_example: {
        excel: `/download/excel?${new URLSearchParams(req.body).toString()}`,
        pdf: `/download/pdf?${new URLSearchParams(req.body).toString()}`,
      },
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
 *     summary: Faz download do relatório em Excel
 *     parameters:
 *       - in: query
 *         name: turma_id (1)
 *         schema:
 *           type: integer
 *       - in: query
 *         name: professor_id (1 or 2)
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Arquivo Excel
 */
app.get("/download/excel", async (req, res) => {
  try {
    const rows = await buscarRelatorio(req.query);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Relatório");

    sheet.columns = [
      { header: "Aluno", key: "aluno" },
      { header: "Email", key: "email" },
      { header: "Turma", key: "turma" },
      { header: "Atividade", key: "atividade" },
      { header: "Nota", key: "nota" },
      { header: "Conceito", key: "conceito" },
      { header: "Presença", key: "presenca" },
      { header: "Horas", key: "horas" },
      { header: "Status", key: "status" },
      { header: "Professor(es)", key: "professores" },
    ];

    rows.forEach(r => {
      sheet.addRow({
        ...r,
        presenca: r.presenca ? "Presente" : "Faltou",
      });
    });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=relatorio.xlsx");
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("Erro /download/excel:", err);
    if (!res.headersSent) res.status(500).send("Erro ao gerar Excel: " + err.message);
  }
});

// --- Download PDF ---
/**
 * @openapi
 * /download/pdf:
 *   get:
 *     summary: Faz download do relatório em PDF
 *     parameters:
 *       - in: query
 *         name: turma_id (1)
 *         schema:
 *           type: integer
 *       - in: query
 *         name: professor_id (1 or 2)
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Arquivo PDF
 */
app.get("/download/pdf", async (req, res) => {
  try {
    const rows = await buscarRelatorio(req.query);

    const doc = new PDFDocument({ margin: 30, size: "A4", layout: "landscape" });
    res.setHeader("Content-Disposition", "attachment; filename=relatorio.pdf");
    res.setHeader("Content-Type", "application/pdf");
    doc.pipe(res);

    doc.fontSize(18).text("Relatório da Turma", { align: "center" });
    doc.moveDown();

    const tableTop = 100;
    const colWidths = [80, 120, 60, 100, 40, 60, 60, 50, 80, 120];
    const headers = ["Aluno", "Email", "Turma", "Atividade", "Nota", "Conceito", "Presença", "Horas", "Status", "Professor(es)"];

    let x = 30;
    headers.forEach((h, i) => {
      doc.font("Helvetica-Bold").fontSize(10).text(h, x, tableTop, { width: colWidths[i], align: "center" });
      x += colWidths[i];
    });

    let y = tableTop + 20;
    rows.forEach(r => {
      let x = 30;
      const valores = [
        r.aluno,
        r.email,
        r.turma,
        r.atividade,
        r.nota || "-",
        r.conceito || "-",
        r.presenca ? "Presente" : "Faltou",
        r.horas || "-",
        r.status,
        r.professores || "-",
      ];
      valores.forEach((val, i) => {
        doc.font("Helvetica").fontSize(9).text(String(val), x, y, { width: colWidths[i], align: "center" });
        x += colWidths[i];
      });
      y += 20;
      if (y > 500) {
        doc.addPage({ size: "A4", layout: "landscape" });
        y = 50;
      }
    });

    doc.end();
  } catch (err) {
    console.error("Erro /download/pdf:", err);
    if (!res.headersSent) res.status(500).send("Erro ao gerar PDF: " + err.message);
  }
});

// --- Start ---
app.listen(port, () => {
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