import { eq, desc } from "drizzle-orm";
import { db } from "./db";
import {
  championships,
  players,
  matches,
  type Player,
  type InsertPlayer,
  type Match,
  type Championship,
  type InsertChampionship,
} from "@shared/schema";

export interface IStorage {
  // Championships
  getAllChampionships(): Promise<Championship[]>;
  getChampionship(id: string): Promise<Championship | undefined>;
  createChampionship(data: InsertChampionship): Promise<Championship>;
  updateChampionship(id: string, name: string): Promise<Championship | undefined>;
  resetChampionship(id: string): Promise<void>;

  // Players
  getPlayersByChampionship(championshipId: string): Promise<Player[]>;
  getPlayer(id: string): Promise<Player | undefined>;
  createPlayer(player: InsertPlayer): Promise<Player>;
  updatePlayer(id: string, updates: Partial<Player>): Promise<Player | undefined>;
  deletePlayer(id: string): Promise<boolean>;

  // Matches
  getMatchesByChampionship(championshipId: string): Promise<Match[]>;
  getMatch(id: string): Promise<Match | undefined>;
  createMatch(match: Omit<Match, "id">): Promise<Match>;
  deleteMatch(id: string): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  // ---- Championships ----

  async getAllChampionships(): Promise<Championship[]> {
    return db.select().from(championships);
  }

  async getChampionship(id: string): Promise<Championship | undefined> {
    const [champ] = await db.select().from(championships).where(eq(championships.id, id));
    return champ;
  }

  async createChampionship(data: InsertChampionship): Promise<Championship> {
    const [champ] = await db.insert(championships).values(data).returning();
    return champ;
  }

  async updateChampionship(id: string, name: string): Promise<Championship | undefined> {
    const [updated] = await db
      .update(championships)
      .set({ name })
      .where(eq(championships.id, id))
      .returning();
    return updated;
  }

  async resetChampionship(id: string): Promise<void> {
    // Delete all matches for this championship
    await db.delete(matches).where(eq(matches.championshipId, id));
    // Reset all players' Elo and gamesPlayed to initial values
    await db
      .update(players)
      .set({ elo: 1200, gamesPlayed: 0 })
      .where(eq(players.championshipId, id));
  }

  // ---- Players ----

  async getPlayersByChampionship(championshipId: string): Promise<Player[]> {
    return db
      .select()
      .from(players)
      .where(eq(players.championshipId, championshipId));
  }

  async getPlayer(id: string): Promise<Player | undefined> {
    const [player] = await db.select().from(players).where(eq(players.id, id));
    return player;
  }

  async createPlayer(insertPlayer: InsertPlayer): Promise<Player> {
    const [player] = await db
      .insert(players)
      .values({ ...insertPlayer, elo: insertPlayer.elo ?? 1200, gamesPlayed: 0 })
      .returning();
    return player;
  }

  async updatePlayer(id: string, updates: Partial<Player>): Promise<Player | undefined> {
    const [updated] = await db
      .update(players)
      .set(updates)
      .where(eq(players.id, id))
      .returning();
    return updated;
  }

  async deletePlayer(id: string): Promise<boolean> {
    const result = await db.delete(players).where(eq(players.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // ---- Matches ----

  async getMatchesByChampionship(championshipId: string): Promise<Match[]> {
    return db
      .select()
      .from(matches)
      .where(eq(matches.championshipId, championshipId))
      .orderBy(desc(matches.timestamp));
  }

  async getMatch(id: string): Promise<Match | undefined> {
    const [match] = await db.select().from(matches).where(eq(matches.id, id));
    return match;
  }

  async createMatch(matchData: Omit<Match, "id">): Promise<Match> {
    const [match] = await db.insert(matches).values(matchData).returning();
    return match;
  }

  async deleteMatch(id: string): Promise<boolean> {
    const match = await this.getMatch(id);
    if (!match) return false;

    // Revert Elo for both players
    const [whitePlayer, blackPlayer] = await Promise.all([
      this.getPlayer(match.whitePlayerId),
      this.getPlayer(match.blackPlayerId),
    ]);

    await Promise.all([
      whitePlayer &&
        this.updatePlayer(whitePlayer.id, {
          elo: match.whiteEloBefore,
          gamesPlayed: Math.max(0, whitePlayer.gamesPlayed - 1),
        }),
      blackPlayer &&
        this.updatePlayer(blackPlayer.id, {
          elo: match.blackEloBefore,
          gamesPlayed: Math.max(0, blackPlayer.gamesPlayed - 1),
        }),
    ]);

    const result = await db.delete(matches).where(eq(matches.id, id));
    return (result.rowCount ?? 0) > 0;
  }
}

export const storage = new DatabaseStorage();

// ---- Seed default championships if none exist ----
// Called once at server startup to ensure the 5 championships are always present.
export async function seedDefaultChampionships() {
  const existing = await storage.getAllChampionships();
  if (existing.length === 0) {
    const defaultNames = [
      "Championnat 1",
      "Championnat 2",
      "Championnat 3",
      "Championnat 4",
      "Championnat 5",
    ];
    for (const name of defaultNames) {
      await storage.createChampionship({ name });
    }
  }
}
