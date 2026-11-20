import { createServer } from "node:http";
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

// This worker has no HTTP API of its own, but Render's free plan only exists for Web
// Services (a Background Worker needs a paid instance) — so it's deployed as a Web Service
// too, and just needs something to answer Render's health check on $PORT.
function startHealthServer(): ReturnType<typeof createServer> {
  const port = Number(process.env.PORT ?? 10000);
  const server = createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  server.listen(port, () => console.log(`health check listening on :${port}`));
  return server;
}

async function main(): Promise<void> {
  const { analysis, report } = startWorkers();
  const health = startHealthServer();
  console.log(`InspectAI workers running: ${analysis.name}, ${report.name}`);
  const shutdown = async () => {
    await Promise.all([analysis.close(), report.close()]);
    health.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

if (process.argv[1]?.endsWith("main.js") || process.argv[1]?.endsWith("src/main.ts")) {
  void main();
}
