var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server/index.ts
import express2 from "express";

// server/routes.ts
import { createServer } from "http";

// server/storage.ts
import { eq, desc, asc } from "drizzle-orm";

// server/db.ts
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

// shared/schema.ts
var schema_exports = {};
__export(schema_exports, {
  championships: () => championships,
  insertChampionshipSchema: () => insertChampionshipSchema,
  insertMatchSchema: () => insertMatchSchema,
  insertPlayerSchema: () => insertPlayerSchema,
  matches: () => matches,
  players: () => players
});
import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
var championships = pgTable("championships", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  position: integer("position").notNull().default(0),
  eloMin: integer("elo_min"),
  key: text("key").unique()
  // stable slug — never rename this column
});
var players = pgTable("players", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  elo: real("elo").notNull().default(1200),
  gamesPlayed: integer("games_played").notNull().default(0)
});
var matches = pgTable("matches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  championshipId: varchar("championship_id").notNull().references(() => championships.id),
  whitePlayerId: varchar("white_player_id").notNull().references(() => players.id),
  blackPlayerId: varchar("black_player_id").notNull().references(() => players.id),
  result: text("result").notNull(),
  whiteEloBefore: real("white_elo_before").notNull(),
  blackEloBefore: real("black_elo_before").notNull(),
  whiteEloAfter: real("white_elo_after").notNull(),
  blackEloAfter: real("black_elo_after").notNull(),
  whiteEloDelta: real("white_elo_delta").notNull(),
  blackEloDelta: real("black_elo_delta").notNull(),
  timestamp: timestamp("timestamp").notNull().default(sql`now()`)
});
var insertChampionshipSchema = createInsertSchema(championships).omit({ id: true });
var insertPlayerSchema = createInsertSchema(players).omit({
  id: true,
  gamesPlayed: true
});
var insertMatchSchema = createInsertSchema(matches).omit({
  id: true,
  whiteEloBefore: true,
  blackEloBefore: true,
  whiteEloAfter: true,
  blackEloAfter: true,
  whiteEloDelta: true,
  blackEloDelta: true,
  timestamp: true
}).extend({
  result: z.enum(["white", "draw", "black"])
});

// server/db.ts
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Please provision the database.");
}
var pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
var db = drizzle(pool, { schema: schema_exports });

// server/storage.ts
var DatabaseStorage = class {
  // ── Championships ─────────────────────────────────────────────────────────
  async getAllChampionships() {
    return db.select().from(championships).orderBy(asc(championships.position));
  }
  async getChampionship(id) {
    const [champ] = await db.select().from(championships).where(eq(championships.id, id));
    return champ;
  }
  async createChampionship(data) {
    const [champ] = await db.insert(championships).values(data).returning();
    return champ;
  }
  async updateChampionship(id, name) {
    const [updated] = await db.update(championships).set({ name }).where(eq(championships.id, id)).returning();
    return updated;
  }
  // Deletes a championship AND all its matches (FK cascade-safe)
  async deleteChampionship(id) {
    await db.delete(matches).where(eq(matches.championshipId, id));
    await db.delete(championships).where(eq(championships.id, id));
  }
  // Resets a championship/league: deletes its matches only — Elo stays intact
  async resetChampionship(id) {
    await db.delete(matches).where(eq(matches.championshipId, id));
  }
  // ── Players (global) ──────────────────────────────────────────────────────
  async getAllPlayers() {
    return db.select().from(players);
  }
  async getPlayer(id) {
    const [player] = await db.select().from(players).where(eq(players.id, id));
    return player;
  }
  async createPlayer(insertPlayer) {
    const [player] = await db.insert(players).values({ ...insertPlayer, elo: insertPlayer.elo ?? 1200, gamesPlayed: 0 }).returning();
    return player;
  }
  async updatePlayer(id, updates) {
    const [updated] = await db.update(players).set(updates).where(eq(players.id, id)).returning();
    return updated;
  }
  async deletePlayer(id) {
    const result = await db.delete(players).where(eq(players.id, id));
    return (result.rowCount ?? 0) > 0;
  }
  async resetPlayerElo(id) {
    const [updated] = await db.update(players).set({ elo: 1200, gamesPlayed: 0 }).where(eq(players.id, id)).returning();
    return updated;
  }
  // ── Matches ───────────────────────────────────────────────────────────────
  async getMatchesByChampionship(championshipId) {
    return db.select().from(matches).where(eq(matches.championshipId, championshipId)).orderBy(desc(matches.timestamp));
  }
  async getMatch(id) {
    const [match] = await db.select().from(matches).where(eq(matches.id, id));
    return match;
  }
  /**
   * Atomic match creation: inserts the match record AND updates both players'
   * Elo inside a single DB transaction. If any step fails the whole thing
   * rolls back — the server never reaches a partially-updated state.
   */
  async recordMatchTransaction(matchData, whiteNewElo, whiteNewGames, blackNewElo, blackNewGames) {
    return db.transaction(async (tx) => {
      const [newMatch] = await tx.insert(matches).values(matchData).returning();
      await tx.update(players).set({ elo: whiteNewElo, gamesPlayed: whiteNewGames }).where(eq(players.id, matchData.whitePlayerId));
      await tx.update(players).set({ elo: blackNewElo, gamesPlayed: blackNewGames }).where(eq(players.id, matchData.blackPlayerId));
      return newMatch;
    });
  }
  // Deletes a match and reverts both players' Elo to their snapshot values
  async deleteMatch(id) {
    const match = await this.getMatch(id);
    if (!match) return false;
    const [whitePlayer, blackPlayer] = await Promise.all([
      this.getPlayer(match.whitePlayerId),
      this.getPlayer(match.blackPlayerId)
    ]);
    await Promise.all([
      whitePlayer && this.updatePlayer(whitePlayer.id, {
        elo: match.whiteEloBefore,
        gamesPlayed: Math.max(0, whitePlayer.gamesPlayed - 1)
      }),
      blackPlayer && this.updatePlayer(blackPlayer.id, {
        elo: match.blackEloBefore,
        gamesPlayed: Math.max(0, blackPlayer.gamesPlayed - 1)
      })
    ]);
    const result = await db.delete(matches).where(eq(matches.id, id));
    return (result.rowCount ?? 0) > 0;
  }
};
var storage = new DatabaseStorage();
var SEED_ENTRIES = [
  { key: "ligue-pion", name: "Ligue Pion", position: 0, eloMin: 0 },
  { key: "ligue-roi", name: "Ligue Roi", position: 1, eloMin: 900 }
];
async function seedDefaultChampionships() {
  let existing;
  try {
    existing = await storage.getAllChampionships();
  } catch (err) {
    console.error("[Seed] Could not fetch championships, skipping seed:", err);
    return;
  }
  const byKey = new Map(existing.filter((c) => c.key).map((c) => [c.key, c]));
  for (const entry of SEED_ENTRIES) {
    try {
      if (!byKey.has(entry.key)) {
        await storage.createChampionship(entry);
        console.log(`[Seed] Created "${entry.name}" (key=${entry.key}, eloMin=${entry.eloMin ?? "null"})`);
      } else {
        const row = byKey.get(entry.key);
        const expectedEloMin = entry.eloMin ?? null;
        if (row.eloMin !== expectedEloMin) {
          await db.update(championships).set({ eloMin: expectedEloMin }).where(eq(championships.key, entry.key));
          console.log(`[Seed] Repaired eloMin for "${row.name}" (${row.eloMin} \u2192 ${expectedEloMin})`);
        }
      }
    } catch (err) {
      console.error(`[Seed] Error processing entry key="${entry.key}":`, err);
    }
  }
}

// server/routes.ts
import { z as z2 } from "zod";
function getKFactor(gamesPlayed, elo) {
  if (gamesPlayed < 30) return 40;
  if (elo >= 2400) return 10;
  return 20;
}
function expectedScore(ratingA, ratingB) {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}
var LEAGUE_THRESHOLD = 900;
function leagueName(elo) {
  return elo >= LEAGUE_THRESHOLD ? "Ligue Roi" : "Ligue Pion";
}
async function registerRoutes(app2) {
  app2.get("/api/championships", async (_req, res) => {
    try {
      res.json(await storage.getAllChampionships());
    } catch (err) {
      console.error("[GET /api/championships]", err);
      res.status(500).json({ error: "Failed to fetch championships" });
    }
  });
  app2.post("/api/championships", async (req, res) => {
    try {
      const { name } = z2.object({ name: z2.string().min(1).max(100).trim() }).parse(req.body);
      const all = await storage.getAllChampionships();
      const duplicate = all.find((c) => c.name.toLowerCase() === name.toLowerCase());
      if (duplicate) {
        return res.status(409).json({ error: `Un championnat nomm\xE9 "${duplicate.name}" existe d\xE9j\xE0.` });
      }
      const maxPos = all.reduce((m, c) => Math.max(m, c.position), -1);
      const champ = await storage.createChampionship({ name, position: maxPos + 1 });
      console.log(`[Championship] Cr\xE9\xE9: "${champ.name}" (id=${champ.id})`);
      res.status(201).json(champ);
    } catch (err) {
      if (err?.name === "ZodError") return res.status(400).json({ error: "Nom invalide." });
      console.error("[POST /api/championships]", err);
      res.status(500).json({ error: "Failed to create championship" });
    }
  });
  app2.patch("/api/championships/:id", async (req, res) => {
    try {
      const { name } = z2.object({ name: z2.string().min(1).trim() }).parse(req.body);
      const champ = await storage.updateChampionship(req.params.id, name);
      if (!champ) return res.status(404).json({ error: "Championship not found" });
      res.json(champ);
    } catch (err) {
      if (err?.name === "ZodError") return res.status(400).json({ error: "Nom invalide." });
      console.error("[PATCH /api/championships/:id]", err);
      res.status(500).json({ error: "Failed to update championship" });
    }
  });
  app2.delete("/api/championships/:id", async (req, res) => {
    try {
      const champ = await storage.getChampionship(req.params.id);
      if (!champ) return res.status(404).json({ error: "Championship not found" });
      if (champ.key === "ligue-pion" || champ.key === "ligue-roi") {
        return res.status(403).json({ error: "Les ligues officielles ne peuvent pas \xEAtre supprim\xE9es." });
      }
      await storage.deleteChampionship(req.params.id);
      console.log(`[Championship] Supprim\xE9: "${champ.name}" (id=${champ.id})`);
      res.json({ success: true });
    } catch (err) {
      console.error("[DELETE /api/championships/:id]", err);
      res.status(500).json({ error: "Failed to delete championship" });
    }
  });
  app2.post("/api/championships/:id/reset", async (req, res) => {
    try {
      const champ = await storage.getChampionship(req.params.id);
      if (!champ) return res.status(404).json({ error: "Championship not found" });
      await storage.resetChampionship(req.params.id);
      console.log(`[Championship] R\xE9initialis\xE9: "${champ.name}" (id=${champ.id})`);
      res.json({ success: true });
    } catch (err) {
      console.error("[POST /api/championships/:id/reset]", err);
      res.status(500).json({ error: "Failed to reset championship" });
    }
  });
  app2.get("/api/players", async (_req, res) => {
    try {
      res.json(await storage.getAllPlayers());
    } catch (err) {
      console.error("[GET /api/players]", err);
      res.status(500).json({ error: "Failed to fetch players" });
    }
  });
  app2.post("/api/players", async (req, res) => {
    try {
      const validated = insertPlayerSchema.parse(req.body);
      const player = await storage.createPlayer(validated);
      console.log(`[Player] Cr\xE9\xE9: "${player.name}" (Elo initial: ${Math.round(player.elo)}) \u2192 ${leagueName(player.elo)}`);
      res.status(201).json(player);
    } catch (err) {
      if (err?.name === "ZodError") return res.status(400).json({ error: "Invalid player data", details: err.errors });
      console.error("[POST /api/players]", err);
      res.status(500).json({ error: "Failed to create player" });
    }
  });
  app2.patch("/api/players/:id", async (req, res) => {
    try {
      const { name } = z2.object({ name: z2.string().min(1) }).parse(req.body);
      const player = await storage.updatePlayer(req.params.id, { name });
      if (!player) return res.status(404).json({ error: "Player not found" });
      res.json(player);
    } catch (err) {
      if (err?.name === "ZodError") return res.status(400).json({ error: "Nom invalide." });
      console.error("[PATCH /api/players/:id]", err);
      res.status(500).json({ error: "Failed to update player" });
    }
  });
  app2.delete("/api/players/:id", async (req, res) => {
    try {
      const deleted = await storage.deletePlayer(req.params.id);
      if (!deleted) return res.status(404).json({ error: "Player not found" });
      res.json({ success: true });
    } catch (err) {
      console.error("[DELETE /api/players/:id]", err);
      res.status(500).json({ error: "Failed to delete player" });
    }
  });
  app2.post("/api/players/:id/reset-elo", async (req, res) => {
    try {
      const player = await storage.resetPlayerElo(req.params.id);
      if (!player) return res.status(404).json({ error: "Player not found" });
      console.log(`[Player] Elo r\xE9initialis\xE9: "${player.name}" \u2192 1200`);
      res.json(player);
    } catch (err) {
      console.error("[POST /api/players/:id/reset-elo]", err);
      res.status(500).json({ error: "Failed to reset player Elo" });
    }
  });
  app2.get("/api/championships/:id/matches", async (req, res) => {
    try {
      res.json(await storage.getMatchesByChampionship(req.params.id));
    } catch (err) {
      console.error("[GET /api/championships/:id/matches]", err);
      res.status(500).json({ error: "Failed to fetch matches" });
    }
  });
  app2.post("/api/championships/:id/matches", async (req, res) => {
    try {
      const validated = insertMatchSchema.parse({ ...req.body, championshipId: req.params.id });
      const [whitePlayer, blackPlayer] = await Promise.all([
        storage.getPlayer(validated.whitePlayerId),
        storage.getPlayer(validated.blackPlayerId)
      ]);
      if (!whitePlayer || !blackPlayer) {
        return res.status(404).json({ error: "Joueur introuvable." });
      }
      if (whitePlayer.id === blackPlayer.id) {
        return res.status(400).json({ error: "Un joueur ne peut pas jouer contre lui-m\xEAme." });
      }
      const resultScore = validated.result === "white" ? 1 : validated.result === "black" ? 0 : 0.5;
      const whiteExpected = expectedScore(whitePlayer.elo, blackPlayer.elo);
      const blackExpected = 1 - whiteExpected;
      const whiteK = getKFactor(whitePlayer.gamesPlayed, whitePlayer.elo);
      const blackK = getKFactor(blackPlayer.gamesPlayed, blackPlayer.elo);
      const whiteEloDelta = whiteK * (resultScore - whiteExpected);
      const blackEloDelta = blackK * (1 - resultScore - blackExpected);
      const whiteEloAfter = whitePlayer.elo + whiteEloDelta;
      const blackEloAfter = blackPlayer.elo + blackEloDelta;
      const match = await storage.recordMatchTransaction(
        {
          championshipId: req.params.id,
          whitePlayerId: validated.whitePlayerId,
          blackPlayerId: validated.blackPlayerId,
          result: validated.result,
          whiteEloBefore: whitePlayer.elo,
          blackEloBefore: blackPlayer.elo,
          whiteEloAfter,
          blackEloAfter,
          whiteEloDelta,
          blackEloDelta,
          timestamp: /* @__PURE__ */ new Date()
        },
        whiteEloAfter,
        whitePlayer.gamesPlayed + 1,
        blackEloAfter,
        blackPlayer.gamesPlayed + 1
      );
      const whiteOldLeague = leagueName(whitePlayer.elo);
      const whiteNewLeague = leagueName(whiteEloAfter);
      const blackOldLeague = leagueName(blackPlayer.elo);
      const blackNewLeague = leagueName(blackEloAfter);
      if (whiteOldLeague !== whiteNewLeague) {
        console.log(
          `[Ligue Migration] ${whitePlayer.name} : ${whiteOldLeague} \u2192 ${whiteNewLeague} (Elo ${Math.round(whitePlayer.elo)} \u2192 ${Math.round(whiteEloAfter)})`
        );
      }
      if (blackOldLeague !== blackNewLeague) {
        console.log(
          `[Ligue Migration] ${blackPlayer.name} : ${blackOldLeague} \u2192 ${blackNewLeague} (Elo ${Math.round(blackPlayer.elo)} \u2192 ${Math.round(blackEloAfter)})`
        );
      }
      res.status(201).json(match);
    } catch (err) {
      if (err?.name === "ZodError") return res.status(400).json({ error: "Donn\xE9es de match invalides.", details: err.errors });
      console.error("[POST /api/championships/:id/matches]", err);
      res.status(500).json({ error: "Failed to create match" });
    }
  });
  app2.delete("/api/matches/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteMatch(req.params.id);
      if (!deleted) return res.status(404).json({ error: "Match introuvable." });
      res.json({ success: true });
    } catch (err) {
      console.error("[DELETE /api/matches/:id]", err);
      res.status(500).json({ error: "Failed to delete match" });
    }
  });
  const httpServer = createServer(app2);
  return httpServer;
}

// server/vite.ts
import express from "express";
import fs from "fs";
import path2 from "path";
import { createServer as createViteServer, createLogger } from "vite";

// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
var vite_config_default = defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...process.env.NODE_ENV !== "production" && process.env.REPL_ID !== void 0 ? [
      await import("@replit/vite-plugin-cartographer").then(
        (m) => m.cartographer()
      ),
      await import("@replit/vite-plugin-dev-banner").then(
        (m) => m.devBanner()
      )
    ] : []
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets")
    }
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"]
    }
  }
});

// server/vite.ts
import { nanoid } from "nanoid";
var viteLogger = createLogger();
function log(message, source = "express") {
  const formattedTime = (/* @__PURE__ */ new Date()).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}
async function setupVite(app2, server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const vite = await createViteServer({
    ...vite_config_default,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      }
    },
    server: serverOptions,
    appType: "custom"
  });
  app2.use(vite.middlewares);
  app2.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path2.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html"
      );
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app2) {
  const distPath = path2.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app2.use(express.static(distPath));
  app2.use("*", (_req, res) => {
    res.sendFile(path2.resolve(distPath, "index.html"));
  });
}

// server/index.ts
var app = express2();
app.use(express2.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express2.urlencoded({ extended: false }));
app.use((req, res, next) => {
  const start = Date.now();
  const path3 = req.path;
  let capturedJsonResponse = void 0;
  const originalResJson = res.json;
  res.json = function(bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path3.startsWith("/api")) {
      let logLine = `${req.method} ${path3} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "\u2026";
      }
      log(logLine);
    }
  });
  next();
});
(async () => {
  await seedDefaultChampionships();
  const server = await registerRoutes(app);
  app.use((err, _req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
    throw err;
  });
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true
  }, () => {
    log(`serving on port ${port}`);
  });
})();
