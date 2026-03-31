import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertPlayerSchema, insertMatchSchema } from "@shared/schema";
import { z } from "zod";

// ── Elo helpers ───────────────────────────────────────────────────────────────

function getKFactor(gamesPlayed: number, elo: number): number {
  if (gamesPlayed < 30) return 40;
  if (elo >= 2400) return 10;
  return 20;
}

function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

/** Threshold that separates Ligue Pion (< 900) from Ligue Roi (≥ 900). */
const LEAGUE_THRESHOLD = 900;

function leagueName(elo: number): string {
  return elo >= LEAGUE_THRESHOLD ? "Ligue Roi" : "Ligue Pion";
}

// ── Routes ────────────────────────────────────────────────────────────────────

export async function registerRoutes(app: Express): Promise<Server> {

  // ── Championships ──────────────────────────────────────────────────────────

  app.get("/api/championships", async (_req, res) => {
    try {
      res.json(await storage.getAllChampionships());
    } catch (err) {
      console.error("[GET /api/championships]", err);
      res.status(500).json({ error: "Failed to fetch championships" });
    }
  });

  // Create a new manual championship (eloMin stays null — manual enrollment)
  app.post("/api/championships", async (req, res) => {
    try {
      const { name } = z.object({ name: z.string().min(1).max(100).trim() }).parse(req.body);

      // Duplicate name guard (case-insensitive)
      const all = await storage.getAllChampionships();
      const duplicate = all.find((c) => c.name.toLowerCase() === name.toLowerCase());
      if (duplicate) {
        return res.status(409).json({ error: `Un championnat nommé "${duplicate.name}" existe déjà.` });
      }

      const maxPos = all.reduce((m, c) => Math.max(m, c.position), -1);
      const champ = await storage.createChampionship({ name, position: maxPos + 1 });
      console.log(`[Championship] Créé: "${champ.name}" (id=${champ.id})`);
      res.status(201).json(champ);
    } catch (err: any) {
      if (err?.name === "ZodError") return res.status(400).json({ error: "Nom invalide." });
      console.error("[POST /api/championships]", err);
      res.status(500).json({ error: "Failed to create championship" });
    }
  });

  app.patch("/api/championships/:id", async (req, res) => {
    try {
      const { name } = z.object({ name: z.string().min(1).trim() }).parse(req.body);
      const champ = await storage.updateChampionship(req.params.id, name);
      if (!champ) return res.status(404).json({ error: "Championship not found" });
      res.json(champ);
    } catch (err: any) {
      if (err?.name === "ZodError") return res.status(400).json({ error: "Nom invalide." });
      console.error("[PATCH /api/championships/:id]", err);
      res.status(500).json({ error: "Failed to update championship" });
    }
  });

  // Delete a manually created championship (official leagues with key are protected)
  app.delete("/api/championships/:id", async (req, res) => {
    try {
      const champ = await storage.getChampionship(req.params.id);
      if (!champ) return res.status(404).json({ error: "Championship not found" });
      if (champ.key === "ligue-pion" || champ.key === "ligue-roi") {
        return res.status(403).json({ error: "Les ligues officielles ne peuvent pas être supprimées." });
      }
      await storage.deleteChampionship(req.params.id);
      console.log(`[Championship] Supprimé: "${champ.name}" (id=${champ.id})`);
      res.json({ success: true });
    } catch (err) {
      console.error("[DELETE /api/championships/:id]", err);
      res.status(500).json({ error: "Failed to delete championship" });
    }
  });

  // Reset: deletes matches only — Elo is never touched
  app.post("/api/championships/:id/reset", async (req, res) => {
    try {
      const champ = await storage.getChampionship(req.params.id);
      if (!champ) return res.status(404).json({ error: "Championship not found" });
      await storage.resetChampionship(req.params.id);
      console.log(`[Championship] Réinitialisé: "${champ.name}" (id=${champ.id})`);
      res.json({ success: true });
    } catch (err) {
      console.error("[POST /api/championships/:id/reset]", err);
      res.status(500).json({ error: "Failed to reset championship" });
    }
  });

  // ── Players ────────────────────────────────────────────────────────────────

  app.get("/api/players", async (_req, res) => {
    try {
      res.json(await storage.getAllPlayers());
    } catch (err) {
      console.error("[GET /api/players]", err);
      res.status(500).json({ error: "Failed to fetch players" });
    }
  });

  app.post("/api/players", async (req, res) => {
    try {
      const validated = insertPlayerSchema.parse(req.body);
      const player = await storage.createPlayer(validated);
      console.log(`[Player] Créé: "${player.name}" (Elo initial: ${Math.round(player.elo)}) → ${leagueName(player.elo)}`);
      res.status(201).json(player);
    } catch (err: any) {
      if (err?.name === "ZodError") return res.status(400).json({ error: "Invalid player data", details: err.errors });
      console.error("[POST /api/players]", err);
      res.status(500).json({ error: "Failed to create player" });
    }
  });

  app.patch("/api/players/:id", async (req, res) => {
    try {
      const { name } = z.object({ name: z.string().min(1) }).parse(req.body);
      const player = await storage.updatePlayer(req.params.id, { name });
      if (!player) return res.status(404).json({ error: "Player not found" });
      res.json(player);
    } catch (err: any) {
      if (err?.name === "ZodError") return res.status(400).json({ error: "Nom invalide." });
      console.error("[PATCH /api/players/:id]", err);
      res.status(500).json({ error: "Failed to update player" });
    }
  });

  app.delete("/api/players/:id", async (req, res) => {
    try {
      const deleted = await storage.deletePlayer(req.params.id);
      if (!deleted) return res.status(404).json({ error: "Player not found" });
      res.json({ success: true });
    } catch (err) {
      console.error("[DELETE /api/players/:id]", err);
      res.status(500).json({ error: "Failed to delete player" });
    }
  });

  app.post("/api/players/:id/reset-elo", async (req, res) => {
    try {
      const player = await storage.resetPlayerElo(req.params.id);
      if (!player) return res.status(404).json({ error: "Player not found" });
      console.log(`[Player] Elo réinitialisé: "${player.name}" → 1200`);
      res.json(player);
    } catch (err) {
      console.error("[POST /api/players/:id/reset-elo]", err);
      res.status(500).json({ error: "Failed to reset player Elo" });
    }
  });

  // ── Matches ────────────────────────────────────────────────────────────────

  app.get("/api/championships/:id/matches", async (req, res) => {
    try {
      res.json(await storage.getMatchesByChampionship(req.params.id));
    } catch (err) {
      console.error("[GET /api/championships/:id/matches]", err);
      res.status(500).json({ error: "Failed to fetch matches" });
    }
  });

  app.post("/api/championships/:id/matches", async (req, res) => {
    try {
      // Validate input
      const validated = insertMatchSchema.parse({ ...req.body, championshipId: req.params.id });

      // Fetch both players
      const [whitePlayer, blackPlayer] = await Promise.all([
        storage.getPlayer(validated.whitePlayerId),
        storage.getPlayer(validated.blackPlayerId),
      ]);
      if (!whitePlayer || !blackPlayer) {
        return res.status(404).json({ error: "Joueur introuvable." });
      }
      if (whitePlayer.id === blackPlayer.id) {
        return res.status(400).json({ error: "Un joueur ne peut pas jouer contre lui-même." });
      }

      // FIDE Elo calculation
      const resultScore   = validated.result === "white" ? 1 : validated.result === "black" ? 0 : 0.5;
      const whiteExpected = expectedScore(whitePlayer.elo, blackPlayer.elo);
      const blackExpected = 1 - whiteExpected;
      const whiteK        = getKFactor(whitePlayer.gamesPlayed, whitePlayer.elo);
      const blackK        = getKFactor(blackPlayer.gamesPlayed, blackPlayer.elo);
      const whiteEloDelta = whiteK * (resultScore - whiteExpected);
      const blackEloDelta = blackK * ((1 - resultScore) - blackExpected);
      const whiteEloAfter = whitePlayer.elo + whiteEloDelta;
      const blackEloAfter = blackPlayer.elo + blackEloDelta;

      // Atomic: insert match + update both players inside a DB transaction.
      // If any step fails, the whole operation rolls back — no partial state.
      const match = await storage.recordMatchTransaction(
        {
          championshipId: req.params.id,
          whitePlayerId:  validated.whitePlayerId,
          blackPlayerId:  validated.blackPlayerId,
          result:         validated.result,
          whiteEloBefore: whitePlayer.elo,
          blackEloBefore: blackPlayer.elo,
          whiteEloAfter,
          blackEloAfter,
          whiteEloDelta,
          blackEloDelta,
          timestamp: new Date(),
        },
        whiteEloAfter,
        whitePlayer.gamesPlayed + 1,
        blackEloAfter,
        blackPlayer.gamesPlayed + 1,
      );

      // Log league migrations (display-side auto-filter crosses 900)
      const whiteOldLeague = leagueName(whitePlayer.elo);
      const whiteNewLeague = leagueName(whiteEloAfter);
      const blackOldLeague = leagueName(blackPlayer.elo);
      const blackNewLeague = leagueName(blackEloAfter);

      if (whiteOldLeague !== whiteNewLeague) {
        console.log(
          `[Ligue Migration] ${whitePlayer.name} : ${whiteOldLeague} → ${whiteNewLeague}` +
          ` (Elo ${Math.round(whitePlayer.elo)} → ${Math.round(whiteEloAfter)})`,
        );
      }
      if (blackOldLeague !== blackNewLeague) {
        console.log(
          `[Ligue Migration] ${blackPlayer.name} : ${blackOldLeague} → ${blackNewLeague}` +
          ` (Elo ${Math.round(blackPlayer.elo)} → ${Math.round(blackEloAfter)})`,
        );
      }

      res.status(201).json(match);
    } catch (err: any) {
      if (err?.name === "ZodError") return res.status(400).json({ error: "Données de match invalides.", details: err.errors });
      console.error("[POST /api/championships/:id/matches]", err);
      res.status(500).json({ error: "Failed to create match" });
    }
  });

  // Delete a match and revert Elo (atomic in storage.deleteMatch)
  app.delete("/api/matches/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteMatch(req.params.id);
      if (!deleted) return res.status(404).json({ error: "Match introuvable." });
      res.json({ success: true });
    } catch (err) {
      console.error("[DELETE /api/matches/:id]", err);
      res.status(500).json({ error: "Failed to delete match" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
