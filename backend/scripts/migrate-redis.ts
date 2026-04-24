// Redis migration script: Upstash → Railway Redis
// Copies sched:* and conv:* keys using DUMP/RESTORE (preserves type + TTL).
//
// Usage:
//   SOURCE_REDIS_URL="rediss://...upstash.io:..." \
//   DEST_REDIS_URL="redis://default:...@...railway.app:..." \
//   bun run backend/scripts/migrate-redis.ts

import Redis from "ioredis";

const SOURCE_URL = process.env.SOURCE_REDIS_URL;
const DEST_URL = process.env.DEST_REDIS_URL;

if (!SOURCE_URL || !DEST_URL) {
  console.error("ERROR: Se requieren SOURCE_REDIS_URL y DEST_REDIS_URL");
  console.error("  SOURCE_REDIS_URL=rediss://... DEST_REDIS_URL=redis://... bun run backend/scripts/migrate-redis.ts");
  process.exit(1);
}

const src = new Redis(SOURCE_URL, { maxRetriesPerRequest: 3, lazyConnect: true });
const dst = new Redis(DEST_URL, { maxRetriesPerRequest: 3, lazyConnect: true });

// Keys críticas: scheduled jobs + conversation state
// Excluye sched:rl:* (rate limit counters, TTL 60s, no vale migrar)
const PATTERNS = ["sched:queue", "sched:job:*", "sched:phone:*", "conv:*"];

async function migrateKey(k: string): Promise<void> {
  const dump = await src.dumpBuffer(k);
  if (!dump) return; // key expiró entre SCAN y DUMP

  const pttl = await src.pttl(k);
  // pttl -1 = sin expiración → RESTORE con ttl=0 (sin expiración)
  // pttl -2 = no existe    → ya expiró, saltar
  if (pttl === -2) return;

  await dst.restore(k, pttl > 0 ? pttl : 0, dump, "REPLACE");
}

async function migrate(): Promise<void> {
  await src.connect();
  await dst.connect();

  console.log("Conectado a SOURCE y DEST. Iniciando migración...\n");

  // Verificar source
  const srcQueue = await src.zcard("sched:queue");
  console.log(`SOURCE sched:queue: ${srcQueue} jobs pendientes`);

  let total = 0;
  let errors = 0;

  for (const pattern of PATTERNS) {
    let cursor = "0";
    let patternCount = 0;
    do {
      const [next, keys] = await src.scan(cursor, "MATCH", pattern, "COUNT", 200);
      cursor = next;

      const results = await Promise.allSettled(keys.map(migrateKey));
      results.forEach((r, i) => {
        if (r.status === "rejected") {
          console.error(`  ERROR en key "${keys[i]}":`, r.reason);
          errors++;
        }
      });

      patternCount += keys.length;
      total += keys.length;
    } while (cursor !== "0");

    console.log(`[OK] ${pattern}: ${patternCount} keys migradas`);
  }

  console.log(`\n=== Resumen ===`);
  console.log(`Total migradas : ${total}`);
  console.log(`Errores        : ${errors}`);

  // Verificar en destino
  const dstQueue = await dst.zcard("sched:queue");
  const dstJobs = (await dst.keys("sched:job:*")).length;
  const dstConvs = (await dst.keys("conv:*")).length;
  console.log(`\nDEST sched:queue : ${dstQueue} jobs`);
  console.log(`DEST sched:job:* : ${dstJobs} payloads`);
  console.log(`DEST conv:*      : ${dstConvs} estados de conversación`);

  if (srcQueue !== dstQueue) {
    console.warn(`\n⚠  sched:queue difiere: SOURCE=${srcQueue}, DEST=${dstQueue}`);
    console.warn("   Posible causa: jobs procesados durante la migración (normal si hay tráfico)");
  } else {
    console.log("\n✓ sched:queue coincide en SOURCE y DEST");
  }

  await src.quit();
  await dst.quit();

  if (errors > 0) process.exit(1);
}

migrate().catch((err) => {
  console.error("Migración fallida:", err);
  process.exit(1);
});
