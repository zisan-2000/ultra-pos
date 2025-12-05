// // db/client.ts

// import { drizzle } from "drizzle-orm/node-postgres";
// import { Pool } from "pg";
// import * as schema from "./schema";

// declare global {
//   // eslint-disable-next-line no-var
//   var __drizzlePool__: Pool | undefined;
// }

// const createPool = () =>
//   new Pool({
//     connectionString: process.env.SUPABASE_DATABASE_URL!,
//     max: 3, // keep tiny for Supabase Nano
//     idleTimeoutMillis: 5_000,
//     connectionTimeoutMillis: 2_000,
//   });

// const pool = global.__drizzlePool__ ?? createPool();
// if (!global.__drizzlePool__) {
//   global.__drizzlePool__ = pool;
//   pool.on("error", (err) => {
//     console.error("Postgres pool error (will reuse pool):", err);
//   });
// }

// export const db = drizzle(pool, { schema });
