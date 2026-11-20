import { eq, sum } from "drizzle-orm";
import { db } from "@/db";
import { greenLedger } from "@/db/schema";

export async function greenBalance(userId: string) {
  const [row] = await db.select({ total: sum(greenLedger.amount) }).from(greenLedger).where(eq(greenLedger.userId, userId));
  return Number(row?.total ?? 0);
}
