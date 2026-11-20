import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// 개발 중 핫리로드마다 커넥션이 쌓이지 않게 전역에 하나만
const g = globalThis as unknown as { pg?: ReturnType<typeof postgres> };
const client = (g.pg ??= postgres(process.env.DATABASE_URL!));

export const db = drizzle(client, { schema, casing: "snake_case" });
