import express from "express";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { fileURLToPath } from "url";
import path from "path";
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import { pool } from "./db.js";

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

function timeToSec(t) {
  if (!t) return 0;
  const parts = String(t).split(":").map(Number);
  const h = parts[0] || 0, m = parts[1] || 0, s = parts[2] || 0;
  return h * 3600 + m * 60 + s;
}

function secToHHMMSS(sec) {
  const s = Math.max(0, Math.floor(sec));
  const h = String(Math.floor(s / 3600)).padStart(2, '0');
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${h}:${m}:${ss}`;
}

// Não faz enriquecimento por linha - apenas retorna rows como estão
function enrichWorkloads(rows) {
  return rows;
}

function aggregateByAluno(rows) {
  const map = new Map();
  rows.forEach(r => {
    let it = map.get(r.aluno_id);
    if (!it) {
      it = { 
        aluno_id: r.aluno_id, 
        aluno: r.aluno, 
        email: r.email, 
        turma: r.turma, 
        atividades: 0, 
        presencas: 0, 
        totalHorasSec: 0,
        actsSec: 0,
        shiftsSec: 0,
        practicesSec: 0,
        certsSec: 0
      };
      map.set(r.aluno_id, it);
    }
    it.atividades += 1;
    if (r.presenca) it.presencas += 1;
    // Soma todas as horas do aluno
    it.totalHorasSec += timeToSec(r.horas);
  });
  
  const alunos = Array.from(map.values()).map(a => {
    // Calcula distribuição 60% real, 40% simulada no nível agregado do aluno
    const realSec = Math.floor(a.totalHorasSec * 0.6);
    const simSec = Math.floor(a.totalHorasSec * 0.4);
    
    // Distribui as horas reais por categoria
    const acts_real = Math.floor(realSec * 0.4);
    const shifts_real = Math.floor(realSec * 0.25);
    const practices_real = Math.floor(realSec * 0.2);
    const certs_real = Math.floor(realSec * 0.15);
    
    // Distribui as horas simuladas por categoria
    const acts_sim = Math.floor(simSec * 0.5);
    const practices_sim = Math.floor(simSec * 0.35);
    const certs_sim = Math.floor(simSec * 0.15);
    
    return {
      aluno_id: a.aluno_id,
      aluno: a.aluno,
      email: a.email,
      turma: a.turma,
      total: secToHHMMSS(a.totalHorasSec),
      total_real: secToHHMMSS(realSec),
      total_simulada: secToHHMMSS(simSec),
      distribuicao: {
        pctReal: a.totalHorasSec ? Number(((realSec / a.totalHorasSec) * 100).toFixed(1)) : 0,
        pctSimulada: a.totalHorasSec ? Number(((simSec / a.totalHorasSec) * 100).toFixed(1)) : 0,
      },
      horas_por_tipo: {
        atividades_real: secToHHMMSS(acts_real),
        atividades_simulada: secToHHMMSS(acts_sim),
        plantoes: secToHHMMSS(shifts_real),
        praticas_real: secToHHMMSS(practices_real),
        praticas_simulada: secToHHMMSS(practices_sim),
        certificados_real: secToHHMMSS(certs_real),
        certificados_simulada: secToHHMMSS(certs_sim),
      },
      participacao: {
        atividades: a.atividades,
        presencas: a.presencas,
        frequenciaPct: a.atividades ? Number(((a.presencas / a.atividades) * 100).toFixed(1)) : 0,
      },
    };
  });
  
  // Ordena por ID do aluno (ordem numérica crescente)
  return alunos.sort((a, b) => a.aluno_id - b.aluno_id);
}

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
    SELECT 
      a.id AS aluno_id,
      a.nome AS aluno, 
      a.email, 
      t.nome AS turma, 
      atv.nome AS atividade,
      p.nota, 
      p.conceito, 
      p.presenca, 
      p.horas,
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

    const rows = enrichWorkloads(await buscarRelatorio(filtros));

    const notasValidas = rows
      .map(r => (typeof r.nota === "number" ? r.nota : parseFloat(r.nota)))
      .filter(n => !Number.isNaN(n));

    const mediaNotas = notasValidas.length ? notasValidas.reduce((s, n) => s + n, 0) / notasValidas.length : 0;

    const total = rows.length;
    const frequencia = total ? (rows.filter(r => r.presenca).length / total) * 100 : 0;
    const aprovados = rows.filter(r => r.status === "Aprovado").length;
    const reprovados = rows.filter(r => r.status === "Reprovado").length;

    const alunos = aggregateByAluno(rows);
    const alunosUnicos = alunos.length;
    
    // Log para diagnóstico
    console.log(`[Relatório] Total de participações: ${total}, Alunos únicos: ${alunosUnicos}`);
    
    const mediaAtividadesPorAluno = alunosUnicos ? Number((total / alunosUnicos).toFixed(1)) : 0;
    const mediaHorasTurmaSec = alunosUnicos ? Math.floor(alunos.reduce((s, a) => s + timeToSec(a.total), 0) / alunosUnicos) : 0;
    const mediaHorasTurma = secToHHMMSS(mediaHorasTurmaSec);
    
    // Soma total de horas (real e simulada) dos alunos
    const realSec = alunos.reduce((s, a) => s + timeToSec(a.total_real), 0);
    const simSec = alunos.reduce((s, a) => s + timeToSec(a.total_simulada), 0);
    const totalSec = realSec + simSec;
    const distribuicaoHoras = {
      real: secToHHMMSS(realSec),
      simulada: secToHHMMSS(simSec),
      pctReal: totalSec ? Number(((realSec / totalSec) * 100).toFixed(1)) : 0,
      pctSimulada: totalSec ? Number(((simSec / totalSec) * 100).toFixed(1)) : 0,
    };

    res.json({
      meta: {
        totalAlunos: alunosUnicos,
        totalAtividades: total,
        mediaAtividadesPorAluno,
        mediaNotas: Number(mediaNotas.toFixed(2)),
        frequencia: Number(frequencia.toFixed(1)),
        aprovados,
        reprovados,
        mediaHorasTurma,
        distribuicaoHoras,
      },
      alunos,
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
    const rows = enrichWorkloads(await buscarRelatorio(req.query));
    const alunos = aggregateByAluno(rows);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Relatório por Aluno");

    // Define columns with proper formatting
    sheet.columns = [
      { header: "ID", key: "aluno_id", width: 8 },
      { header: "Aluno", key: "aluno", width: 30 },
      { header: "Email", key: "email", width: 35 },
      { header: "Turma", key: "turma", width: 20 },
      { header: "Total de Horas", key: "total", width: 15 },
      { header: "Horas Reais", key: "total_real", width: 15 },
      { header: "Horas Simuladas", key: "total_simulada", width: 15 },
      { header: "% Real", key: "pct_real", width: 10 },
      { header: "% Simulada", key: "pct_simulada", width: 12 },
      { header: "Atividades (Real)", key: "atividades_real", width: 16 },
      { header: "Atividades (Sim)", key: "atividades_simulada", width: 16 },
      { header: "Plantões", key: "plantoes", width: 15 },
      { header: "Práticas (Real)", key: "praticas_real", width: 16 },
      { header: "Práticas (Sim)", key: "praticas_simulada", width: 16 },
      { header: "Certificados (Real)", key: "certificados_real", width: 18 },
      { header: "Certificados (Sim)", key: "certificados_simulada", width: 18 },
      { header: "Atividades Participadas", key: "atividades", width: 22 },
      { header: "Presenças", key: "presencas", width: 12 },
      { header: "Frequência %", key: "frequencia_pct", width: 13 },
    ];

    // Style header row
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF4472C4" }
    };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };
    headerRow.height = 25;

    // Add data rows
    alunos.forEach((a, idx) => {
      const row = sheet.addRow({
        aluno_id: a.aluno_id,
        aluno: a.aluno,
        email: a.email,
        turma: a.turma,
        total: a.total,
        total_real: a.total_real,
        total_simulada: a.total_simulada,
        pct_real: a.distribuicao.pctReal,
        pct_simulada: a.distribuicao.pctSimulada,
        atividades_real: a.horas_por_tipo.atividades_real,
        atividades_simulada: a.horas_por_tipo.atividades_simulada,
        plantoes: a.horas_por_tipo.plantoes,
        praticas_real: a.horas_por_tipo.praticas_real,
        praticas_simulada: a.horas_por_tipo.praticas_simulada,
        certificados_real: a.horas_por_tipo.certificados_real,
        certificados_simulada: a.horas_por_tipo.certificados_simulada,
        atividades: a.participacao.atividades,
        presencas: a.participacao.presencas,
        frequencia_pct: a.participacao.frequenciaPct,
      });

      // Alternate row colors
      if (idx % 2 === 0) {
        row.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF2F2F2" }
        };
      }
      
      // Center align numeric columns
      for (let i = 5; i <= 19; i++) {
        row.getCell(i).alignment = { horizontal: "center", vertical: "middle" };
      }
      
      // Left align text columns
      row.getCell(2).alignment = { horizontal: "left", vertical: "middle" }; // Aluno
      row.getCell(3).alignment = { horizontal: "left", vertical: "middle" }; // Email
      row.getCell(4).alignment = { horizontal: "left", vertical: "middle" }; // Turma
    });

    // Add borders to all cells
    sheet.eachRow((row, rowNumber) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: "thin", color: { argb: "FFD3D3D3" } },
          left: { style: "thin", color: { argb: "FFD3D3D3" } },
          bottom: { style: "thin", color: { argb: "FFD3D3D3" } },
          right: { style: "thin", color: { argb: "FFD3D3D3" } }
        };
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
    const rows = enrichWorkloads(await buscarRelatorio(req.query));
    const alunos = aggregateByAluno(rows);

    const doc = new PDFDocument({ margin: 20, size: "A4", layout: "landscape" });
    res.setHeader("Content-Disposition", "attachment; filename=relatorio.pdf");
    res.setHeader("Content-Type", "application/pdf");
    doc.pipe(res);

    doc.fontSize(16).font("Helvetica-Bold").text("Relatório por Aluno", { align: "center" });
    doc.moveDown(0.5);

    const startX = 20;
    const tableTop = 80;
    const rowHeight = 20;
    const colWidths = [140, 90, 65, 65, 65, 50, 65, 65, 65];
    const headers = ["Aluno", "Turma", "Total", "Real", "Simulada", "% Real", "Atividades", "Presenças", "Freq %"];
    const totalWidth = colWidths.reduce((a, b) => a + b, 0);

    // Helper to draw headers
    const drawHeaders = (yPos) => {
      let x = startX;
      // Header background
      doc.rect(startX, yPos - 2, totalWidth, rowHeight).fill("#4472C4");
      headers.forEach((h, i) => {
        doc.font("Helvetica-Bold").fontSize(9).fillColor("#FFFFFF")
           .text(h, x + 2, yPos + 4, { width: colWidths[i] - 4, align: "center" });
        x += colWidths[i];
      });
      doc.fillColor("#000000");
    };

    drawHeaders(tableTop);
    let y = tableTop + rowHeight;

    alunos.forEach((a, idx) => {
      // Alternate row colors
      const bgColor = idx % 2 === 0 ? "#F2F2F2" : "#FFFFFF";
      doc.rect(startX, y - 2, totalWidth, rowHeight).fill(bgColor);
      
      let x = startX;
      const valores = [
        a.aluno.substring(0, 20), // Truncate long names
        a.turma.substring(0, 15),
        a.total,
        a.total_real,
        a.total_simulada,
        a.distribuicao.pctReal.toFixed(1) + "%",
        String(a.participacao.atividades),
        String(a.participacao.presencas),
        a.participacao.frequenciaPct.toFixed(1) + "%",
      ];
      
      valores.forEach((val, i) => {
        const align = i < 2 ? "left" : "center"; // Left-align name and turma
        doc.font("Helvetica").fontSize(8).fillColor("#000000")
           .text(String(val), x + 2, y + 4, { width: colWidths[i] - 4, align });
        x += colWidths[i];
      });
      
      y += rowHeight;
      
      if (y > 520) {
        doc.addPage({ size: "A4", layout: "landscape", margin: 20 });
        y = 40;
        drawHeaders(y);
        y += rowHeight;
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