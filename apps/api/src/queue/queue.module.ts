import { Global, Module } from "@nestjs/common";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { ANALYSIS_QUEUE_NAME, REPORT_QUEUE_NAME } from "@inspectai/contracts";
import { ANALYSIS_QUEUE, REPORT_QUEUE } from "./tokens.js";

function connection(): Redis {
  return new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", { maxRetriesPerRequest: null });
}

@Global()
@Module({
  providers: [
    {
      provide: ANALYSIS_QUEUE,
      useFactory: () => new Queue(ANALYSIS_QUEUE_NAME, { connection: connection() }),
    },
    {
      provide: REPORT_QUEUE,
      useFactory: () => new Queue(REPORT_QUEUE_NAME, { connection: connection() }),
    },
  ],
  exports: [ANALYSIS_QUEUE, REPORT_QUEUE],
})
export class QueueModule {}
