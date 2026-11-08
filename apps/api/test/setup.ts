import { loadRootEnv, resolveTestDatabaseUrl, setTestS3Env } from "./test-db.js";

setTestS3Env();
loadRootEnv();
process.env.DATABASE_URL = resolveTestDatabaseUrl(process.env.DATABASE_URL);
