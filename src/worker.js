import { createWorker } from './queue.js';
import { generateLargeXlsx } from './reportGenerator.js';
import { gerarRelatorioHorasExcel, gerarRelatorioHorasPdf, gerarRelatorioNotasExcel, gerarRelatorioNotasPdf } from './reportJobs.js';

const processor = async (job) => {
  const { type, turmaId, rows, columns, title, filtros, usuario } = job.data || {};
  job.updateProgress({ stage: 'starting' });

  try {
    let result;

    if (type === 'relatorio-horas-excel') {
      result = await gerarRelatorioHorasExcel({ filtros, usuario });
    } else if (type === 'relatorio-horas-pdf') {
      result = await gerarRelatorioHorasPdf({ filtros, usuario });
    } else if (type === 'relatorio-notas-excel') {
      result = await gerarRelatorioNotasExcel({ filtros, usuario });
    } else if (type === 'relatorio-notas-pdf') {
      result = await gerarRelatorioNotasPdf({ filtros, usuario });
    } else {
      result = await generateLargeXlsx({ rows, columns, title });
    }

    job.updateProgress({ stage: 'finalizing', relatorioId: result.relatorioId });
    return { fileName: result.fileName, relatorioId: result.relatorioId };
  } catch (err) {
    console.error('Erro no processamento do job:', err);
    job.updateProgress({ stage: 'finalizing', error: err.message || 'erro_no_job' });
    throw err;
  }
};

const worker = createWorker(processor);
worker.on('active', (job) => console.log(`Job ${job.id} ativo...`));
worker.on('completed', (job, result) => console.log(`Job ${job.id} concluído:`, result));
worker.on('failed', (job, err) => console.error(`Job ${job?.id} falhou:`, err));
process.on('SIGINT', () => process.exit(0));
