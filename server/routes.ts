import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertPlayerSchema, insertMatchSchema, insertChampionshipSchema } from "@shared/schema";
import { z } from "zod";

function getKFactor(gamesPlayed: number, elo: number): number {
  if (gamesPlayed < 30) return 40;
  if (elo >= 2400) return 10;
  return 20;
}

function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

export async function registerRoutes(app: Express): Promise<Server> {

  // --- Championships ---

  app.get("/api/championships", async (req, res) => {
    try {
      const champs = await storage.getAllChampionships();
      res.json(champs);
    } catch {
      res.status(500).json({ error: "Failed to fetch championships" });
    }
  });

  app.post("/api/championships", async (req, res) => {
    try {
      const validated = insertChampionshipSchema.parse(req.body);
      const champ = await storage.createChampionship(validated);
      res.status(201).json(champ);
    } catch (error: any) {
      if (error.name === 'ZodError') return res.status(400).json({ error: "Invalid data", details: error.errors });
      res.status(500).json({ error: "Failed to create championship" });
    }
  });

  app.patch("/api/championships/:id", async (req, res) => {
    try {
      const { name } = z.object({ name: z.string().min(1) }).parse(req.body);
      const champ = await storage.updateChampionship(req.params.id, name);
      if (!champ) return res.status(404).json({ error: "Championship not found" });
      res.json(champ);
    } catch (error: any) {
      if (error.name === 'ZodError') return res.status(400).json({ error: "Invalid data" });
      res.status(500).json({ error: "Failed to update championship" });
    }
  });

  app.post("/api/championships/:id/reset", async (req, res) => {
    try {
      const champ = await storage.getChampionship(req.params.id);
      if (!champ) return res.status(404).json({ error: "Championship not found" });
      await storage.resetChampionship(req.params.id);
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to reset championship" });
    }
  });

  // --- Players ---

  app.get("/api/championships/:id/players", async (req, res) => {
    try {
      const players = await storage.getPlayersByChampionship(req.params.id);
      res.json(players);
    } catch {
      res.status(500).json({ error: "Failed to fetch players" });
    }
  });

  app.post("/api/championships/:id/players", async (req, res) => {
    try {
      const validated = insertPlayerSchema.parse({
        ...req.body,
        championshipId: req.params.id,
      });
      const player = await storage.createPlayer(validated);
      res.status(201).json(player);
    } catch (error: any) {
      if (error.name === 'ZodError') return res.status(400).json({ error: "Invalid player data", details: error.errors });
      res.status(500).json({ error: "Failed to create player" });
    }
  });

  app.patch("/api/players/:id", async (req, res) => {
    try {
      const { name } = z.object({ name: z.string().min(1) }).parse(req.body);
      const player = await storage.updatePlayer(req.params.id, { name });
      if (!player) return res.status(404).json({ error: "Player not found" });
      res.json(player);
    } catch (error: any) {
      if (error.name === 'ZodError') return res.status(400).json({ error: "Invalid data" });
      res.status(500).json({ error: "Failed to update player" });
    }
  });

  app.delete("/api/players/:id", async (req, res) => {
    try {
      const deleted = await storage.deletePlayer(req.params.id);
      if (!deleted) return res.status(404).json({ error: "Player not found" });
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to delete player" });
    }
  });

  // --- Matches ---

  app.get("/api/championships/:id/matches", async (req, res) => {
    try {
      const matches = await storage.getMatchesByChampionship(req.params.id);
      res.json(matches);
    } catch {
      res.status(500).json({ error: "Failed to fetch matches" });
    }
  });

  app.post("/api/championships/:id/matches", async (req, res) => {
    try {
      const validated = insertMatchSchema.parse({
        ...req.body,
        championshipId: req.params.id,
      });

      const whitePlayer = await storage.getPlayer(validated.whitePlayerId);
      const blackPlayer = await storage.getPlayer(validated.blackPlayerId);

      if (!whitePlayer || !blackPlayer) {
        return res.status(404).json({ error: "Player not found" });
      }
      if (whitePlayer.id === blackPlayer.id) {
        return res.status(400).json({ error: "A player cannot play against themselves" });
      }

      const resultScore = validated.result === 'white' ? 1 : validated.result === 'black' ? 0 : 0.5;
      const whiteExpected = expectedScore(whitePlayer.elo, blackPlayer.elo);
      const blackExpected = 1 - whiteExpected;
      const whiteK = getKFactor(whitePlayer.gamesPlayed, whitePlayer.elo);
      const blackK = getKFactor(blackPlayer.gamesPlayed, blackPlayer.elo);
      const whiteEloDelta = whiteK * (resultScore - whiteExpected);
      const blackEloDelta = blackK * ((1 - resultScore) - blackExpected);
      const whiteEloAfter = whitePlayer.elo + whiteEloDelta;
      const blackEloAfter = blackPlayer.elo + blackEloDelta;

      const match = await storage.createMatch({
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
        timestamp: new Date(),
      });

      await storage.updatePlayer(whitePlayer.id, { elo: whiteEloAfter, gamesPlayed: whitePlayer.gamesPlayed + 1 });
      await storage.updatePlayer(blackPlayer.id, { elo: blackEloAfter, gamesPlayed: blackPlayer.gamesPlayed + 1 });

      res.status(201).json(match);
    } catch (error: any) {
      if (error.name === 'ZodError') return res.status(400).json({ error: "Invalid match data", details: error.errors });
      res.status(500).json({ error: "Failed to create match" });
    }
  });

  app.delete("/api/matches/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteMatch(req.params.id);
      if (!deleted) return res.status(404).json({ error: "Match not found" });
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to delete match" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
