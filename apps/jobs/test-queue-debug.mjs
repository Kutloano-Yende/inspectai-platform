import { Worker, Queue } from "bullmq";
import { createConnection } from "./src/main.js";

const QUEUE_NAME = "analysis";
const connection = createConnection();

try {
  const queue = new Queue(QUEUE_NAME, { connection });
  console.log("Queue created");
  
  // Add a job
  const job = await queue.add("analyze", { inspectionId: "test-123" });
  console.log("Job added:", job.id);
  
  // Check job in queue
  const counts = await queue.getJobCounts();
  console.log("Queue counts:", counts);
  
  // Try to get the job back
  const retrievedJob = await queue.getJob(job.id);
  console.log("Retrieved job:", retrievedJob ? `${retrievedJob.id} (${retrievedJob.progress}%)` : "not found");
  
  // Create a worker
  console.log("Creating worker...");
  const worker = new Worker(QUEUE_NAME, async (j) => {
    console.log("Worker handler called with job:", j.id);
    return { processed: true };
  }, { connection, concurrency: 1 });
  
  console.log("Worker created, waiting for events...");
  
  worker.on("ready", () => console.log("  - ready"));
  worker.on("processing", (j) => console.log("  - processing:", j.id));
  worker.on("completed", (j) => console.log("  - completed:", j.id));
  worker.on("failed", (j, err) => console.log("  - failed:", j.id, err.message));
  worker.on("error", (err) => console.log("  - error:", err.message));
  
  // Wait a bit
  await new Promise(r => setTimeout(r, 3000));
  
  console.log("\nCleanup...");
  await worker.close();
  await queue.close();
  await connection.quit();
  process.exit(0);
} catch (err) {
  console.error("Error:", err);
  process.exit(1);
}
