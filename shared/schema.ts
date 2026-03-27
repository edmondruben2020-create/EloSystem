import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Championships: each has a stable position for consistent tab ordering
// eloMin = null → championship (manual enrollment, points 1/0.5/0)
// eloMin = number → league (players auto-filtered by Elo, points 2/1/0)
export const championships = pgTable("championships", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  position: integer("position").notNull().default(0),
  eloMin: integer("elo_min"),
});

// Players are GLOBAL — not tied to any championship
// Their Elo is updated by every match regardless of which league it's in
export const players = pgTable("players", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  elo: real("elo").notNull().default(1200),
  gamesPlayed: integer("games_played").notNull().default(0),
});

// Matches belong to a specific championship/league
export const matches = pgTable("matches", {
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
  timestamp: timestamp("timestamp").notNull().default(sql`now()`),
});

export const insertChampionshipSchema = createInsertSchema(championships).omit({ id: true });

// Players no longer have a championshipId
export const insertPlayerSchema = createInsertSchema(players).omit({
  id: true,
  gamesPlayed: true,
});

export const insertMatchSchema = createInsertSchema(matches).omit({
  id: true,
  whiteEloBefore: true,
  blackEloBefore: true,
  whiteEloAfter: true,
  blackEloAfter: true,
  whiteEloDelta: true,
  blackEloDelta: true,
  timestamp: true,
}).extend({
  result: z.enum(["white", "draw", "black"]),
});

export type InsertChampionship = z.infer<typeof insertChampionshipSchema>;
export type Championship = typeof championships.$inferSelect;
export type InsertPlayer = z.infer<typeof insertPlayerSchema>;
export type Player = typeof players.$inferSelect;
export type InsertMatch = z.infer<typeof insertMatchSchema>;
export type Match = typeof matches.$inferSelect;
