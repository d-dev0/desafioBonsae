import { createWorker } from './queue.js';
import { generateLargeXlsx } from './reportGenerator.js';
import { generateAlunosReport } from './dbReportGenerator.js';
import { generateTurmaReport } from './dbTurmaReportGenerator.js';

const processor = async (job) => {
  const { type, turmaId, rows, columns, title } = job.data || {};
  job.updateProgress({ stage: 'starting' });
  
  const result = type === "alunos" ? await generateAlunosReport() :
                 type === "turma" ? await generateTurmaReport(turmaId) :
                 await generateLargeXlsx({ rows, columns, title });
  
  job.updateProgress({ stage: 'finalizing' });
  return { fileName: result.fileName };
};

const worker = createWorker(processor);
worker.on('active', (job) => console.log(`Job ${job.id} ativo...`));
worker.on('completed', (job, result) => console.log(`Job ${job.id} concluído:`, result));
worker.on('failed', (job, err) => console.error(`Job ${job?.id} falhou:`, err));
process.on('SIGINT', () => process.exit(0));
