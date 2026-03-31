import { eq, desc, asc } from "drizzle-orm";
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
  deleteChampionship(id: string): Promise<void>;
  resetChampionship(id: string): Promise<void>;

  // Players (global — not per championship)
  getAllPlayers(): Promise<Player[]>;
  getPlayer(id: string): Promise<Player | undefined>;
  createPlayer(player: InsertPlayer): Promise<Player>;
  updatePlayer(id: string, updates: Partial<Player>): Promise<Player | undefined>;
  deletePlayer(id: string): Promise<boolean>;
  resetPlayerElo(id: string): Promise<Player | undefined>;

  // Matches (per championship/league)
  getMatchesByChampionship(championshipId: string): Promise<Match[]>;
  getMatch(id: string): Promise<Match | undefined>;
  /**
   * Records a match AND updates both players' Elo atomically inside a DB transaction.
   * If any step fails, the whole operation is rolled back — no partial state possible.
   */
  recordMatchTransaction(
    matchData: Omit<Match, "id">,
    whiteNewElo: number,
    whiteNewGames: number,
    blackNewElo: number,
    blackNewGames: number,
  ): Promise<Match>;
  deleteMatch(id: string): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  // ── Championships ─────────────────────────────────────────────────────────

  async getAllChampionships(): Promise<Championship[]> {
    return db.select().from(championships).orderBy(asc(championships.position));
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

  // Deletes a championship AND all its matches (FK cascade-safe)
  async deleteChampionship(id: string): Promise<void> {
    await db.delete(matches).where(eq(matches.championshipId, id));
    await db.delete(championships).where(eq(championships.id, id));
  }

  // Resets a championship/league: deletes its matches only — Elo stays intact
  async resetChampionship(id: string): Promise<void> {
    await db.delete(matches).where(eq(matches.championshipId, id));
  }

  // ── Players (global) ──────────────────────────────────────────────────────

  async getAllPlayers(): Promise<Player[]> {
    return db.select().from(players);
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

  async resetPlayerElo(id: string): Promise<Player | undefined> {
    const [updated] = await db
      .update(players)
      .set({ elo: 1200, gamesPlayed: 0 })
      .where(eq(players.id, id))
      .returning();
    return updated;
  }

  // ── Matches ───────────────────────────────────────────────────────────────

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

  /**
   * Atomic match creation: inserts the match record AND updates both players'
   * Elo inside a single DB transaction. If any step fails the whole thing
   * rolls back — the server never reaches a partially-updated state.
   */
  async recordMatchTransaction(
    matchData: Omit<Match, "id">,
    whiteNewElo: number,
    whiteNewGames: number,
    blackNewElo: number,
    blackNewGames: number,
  ): Promise<Match> {
    return db.transaction(async (tx) => {
      const [newMatch] = await tx.insert(matches).values(matchData).returning();

      await tx
        .update(players)
        .set({ elo: whiteNewElo, gamesPlayed: whiteNewGames })
        .where(eq(players.id, matchData.whitePlayerId));

      await tx
        .update(players)
        .set({ elo: blackNewElo, gamesPlayed: blackNewGames })
        .where(eq(players.id, matchData.blackPlayerId));

      return newMatch;
    });
  }

  // Deletes a match and reverts both players' Elo to their snapshot values
  async deleteMatch(id: string): Promise<boolean> {
    const match = await this.getMatch(id);
    if (!match) return false;

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

// ── Seed ──────────────────────────────────────────────────────────────────────
// Only the two official leagues are seeded automatically.
// Manual championships are created by admins via the UI and are never touched here.
const SEED_ENTRIES: InsertChampionship[] = [
  { key: "ligue-pion", name: "Ligue Pion", position: 0, eloMin: 0   },
  { key: "ligue-roi",  name: "Ligue Roi",  position: 1, eloMin: 900 },
];

/**
 * Fully idempotent seed — safe to run on every server start, 100 times in a row.
 *
 * Strategy:
 *   – Lookup is by `key` (immutable slug), never by name or count.
 *   – Missing entry  → insert it.
 *   – Existing entry → repair `eloMin` if a stale seed had left it wrong.
 *   – Every operation is wrapped so a single failure never aborts the others.
 */
export async function seedDefaultChampionships(): Promise<void> {
  let existing: Championship[];
  try {
    existing = await storage.getAllChampionships();
  } catch (err) {
    console.error("[Seed] Could not fetch championships, skipping seed:", err);
    return;
  }

  const byKey = new Map(existing.filter((c) => c.key).map((c) => [c.key!, c]));

  for (const entry of SEED_ENTRIES) {
    try {
      if (!byKey.has(entry.key!)) {
        await storage.createChampionship(entry);
        console.log(`[Seed] Created "${entry.name}" (key=${entry.key}, eloMin=${entry.eloMin ?? "null"})`);
      } else {
        const row = byKey.get(entry.key!)!;
        const expectedEloMin = entry.eloMin ?? null;
        if (row.eloMin !== expectedEloMin) {
          await db
            .update(championships)
            .set({ eloMin: expectedEloMin })
            .where(eq(championships.key, entry.key!));
          console.log(`[Seed] Repaired eloMin for "${row.name}" (${row.eloMin} → ${expectedEloMin})`);
        }
      }
    } catch (err) {
      console.error(`[Seed] Error processing entry key="${entry.key}":`, err);
      // Continue with the next entry — one failure must not abort the whole seed
    }
  }
}
