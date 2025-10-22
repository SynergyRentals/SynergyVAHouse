import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";
import { getRequiredEnv } from './envValidator';

neonConfig.webSocketConstructor = ws;

const DATABASE_URL = getRequiredEnv(
  'DATABASE_URL',
  'PostgreSQL connection string from Neon database'
);

export const pool = new Pool({ connectionString: DATABASE_URL });
export const db = drizzle({ client: pool, schema });