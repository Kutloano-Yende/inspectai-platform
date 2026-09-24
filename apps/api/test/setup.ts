import { loadRootEnv, resolveTestDatabaseUrl } from "./test-db.js";

loadRootEnv();
process.env.DATABASE_URL = resolveTestDatabaseUrl(process.env.DATABASE_URL);
