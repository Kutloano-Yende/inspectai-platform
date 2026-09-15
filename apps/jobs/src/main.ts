import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { PrismaClient } from "@prisma/client";
import { S3Storage } from "@inspectai/storage";
import { ANALYSIS_QUEUE_NAME, REPORT_QUEUE_NAME } from "@inspectai/contracts";
import { StubConditionAnalysisProvider } from "./provider/stub.js";
import { processAnalysisJob } from "./analysis/analysis.worker.js";
import { processReportJob } from "./report/report.worker.js";
import { parseAnalysisPayload, parseReportPayload } from "./payloads.js";

export function createConnection(): Redis {
  return new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", { maxRetriesPerRequest: null });
}

export function startWorkers(): { analysis: Worker; report: Worker; connection: Redis } {
  const connection = createConnection();
  const prisma = new PrismaClient();
  const storage = new S3Storage({
    endpoint: process.env.S3_ENDPOINT ?? "http://localhost:9000",
    region: process.env.S3_REGION ?? "us-east-1",
    accessKeyId: process.env.S3_ACCESS_KEY ?? "",
    secretAccessKey: process.env.S3_SECRET_KEY ?? "",
  });

  const analysis = new Worker(
    ANALYSIS_QUEUE_NAME,
    async (job) => processAnalysisJob({ prisma, provider: new StubConditionAnalysisProvider() }, parseAnalysisPayload(job.data)),
    { connection, concurrency: 1 },
  );
  analysis.on("failed", (job, err) => console.error(`analysis job ${job?.id} failed:`, err));

  const report = new Worker(
    REPORT_QUEUE_NAME,
    async (job) => processReportJob({ prisma, storage, reportsBucket: process.env.S3_REPORTS_BUCKET ?? "inspectai-reports" }, parseReportPayload(job.data)),
    { connection, concurrency: 1 },
  );
  report.on("failed", (job, err) => console.error(`report job ${job?.id} failed:`, err));

  return { analysis, report, connection };
}

async function main(): Promise<void> {
  const { analysis, report } = startWorkers();
  console.log(`InspectAI workers running: ${analysis.name}, ${report.name}`);
  const shutdown = async () => {
    await Promise.all([analysis.close(), report.close()]);
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

if (process.argv[1]?.endsWith("main.js") || process.argv[1]?.endsWith("src/main.ts")) {
  void main();
}
