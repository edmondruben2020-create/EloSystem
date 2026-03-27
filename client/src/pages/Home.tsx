import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import StatsCard from "@/components/StatsCard";
import AddPlayerDialog from "@/components/AddPlayerDialog";
import RecordMatchDialog, { type MatchResult } from "@/components/RecordMatchDialog";
import MatchHistoryItem from "@/components/MatchHistoryItem";
import EditPlayerDialog from "@/components/EditPlayerDialog";
import ThemeToggle from "@/components/ThemeToggle";
import { useAdmin } from "@/context/AdminContext";
import {
  Users, Play, TrendingUp, RotateCcw, Pencil, Check, X,
  Trophy, Medal, Lock, LockOpen, ShieldAlert, Trash2, RefreshCw,
} from "lucide-react";

// ---- Types ----
interface Championship {
  id: string;
  name: string;
  position: number;
  eloMin: number | null; // null = championship (manual, 1/0.5/0 pts); number = league (auto-filter by Elo, 2/1/0 pts)
}
interface Player { id: string; name: string; elo: number; gamesPlayed: number; }
interface Match {
  id: string;
  championshipId: string;
  whitePlayerId: string;
  blackPlayerId: string;
  result: MatchResult;
  whiteEloDelta: number;
  blackEloDelta: number;
  timestamp: string;
}

// ---- Helpers ----
function getKFactor(gamesPlayed: number, elo: number): number {
  if (gamesPlayed < 30) return 40;
  if (elo >= 2400) return 10;
  return 20;
}

/** Returns the players that qualify for a given league given all leagues (for range computation). */
function getLeaguePlayers(league: Championship, allLeagues: Championship[], allPlayers: Player[]): Player[] {
  if (league.eloMin === null) return allPlayers; // championships show everyone
  const sortedLeagues = [...allLeagues].filter((l) => l.eloMin !== null).sort((a, b) => (a.eloMin ?? 0) - (b.eloMin ?? 0));
  const idx = sortedLeagues.findIndex((l) => l.id === league.id);
  const min = league.eloMin ?? 0;
  const next = sortedLeagues[idx + 1];
  const max = next ? (next.eloMin ?? Infinity) : Infinity;
  return allPlayers.filter((p) => p.elo >= min && p.elo < max);
}

// League points (football-style): 2 win / 1 draw / 0 loss — for LEAGUES
function calcLeaguePoints(playerId: string, matches: Match[]): number {
  return matches.reduce((total, m) => {
    if (m.whitePlayerId === playerId)
      return total + (m.result === "white" ? 2 : m.result === "draw" ? 1 : 0);
    if (m.blackPlayerId === playerId)
      return total + (m.result === "black" ? 2 : m.result === "draw" ? 1 : 0);
    return total;
  }, 0);
}

// Tournament points (chess-style): 1 win / 0.5 draw / 0 loss — for CHAMPIONSHIPS
function calcTournamentPoints(playerId: string, matches: Match[]): number {
  return matches.reduce((total, m) => {
    if (m.whitePlayerId === playerId)
      return total + (m.result === "white" ? 1 : m.result === "draw" ? 0.5 : 0);
    if (m.blackPlayerId === playerId)
      return total + (m.result === "black" ? 1 : m.result === "draw" ? 0.5 : 0);
    return total;
  }, 0);
}

function calcWDL(playerId: string, matches: Match[]) {
  let wins = 0, draws = 0, losses = 0;
  matches.forEach((m) => {
    const isWhite = m.whitePlayerId === playerId;
    const isBlack = m.blackPlayerId === playerId;
    if (!isWhite && !isBlack) return;
    if ((isWhite && m.result === "white") || (isBlack && m.result === "black")) wins++;
    else if (m.result === "draw") draws++;
    else losses++;
  });
  return { wins, draws, losses };
}

// ---- Admin Login Dialog ----
function AdminLoginDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { login } = useAdmin();
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (login(password)) { setPassword(""); setError(false); onOpenChange(false); }
    else setError(true);
  };
  const handleClose = () => { setPassword(""); setError(false); onOpenChange(false); };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent data-testid="dialog-admin-login">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Accès administrateur</DialogTitle>
            <DialogDescription>Entrez le mot de passe pour activer les fonctions de modification.</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <Label htmlFor="admin-password">Mot de passe</Label>
            <Input id="admin-password" type="password" value={password} autoFocus
              onChange={(e) => { setPassword(e.target.value); setError(false); }}
              placeholder="••••••••••••••••" data-testid="input-admin-password" />
            {error && (
              <p className="text-sm text-destructive flex items-center gap-1" data-testid="text-admin-error">
                <ShieldAlert className="w-4 h-4" /> Mot de passe incorrect.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>Annuler</Button>
            <Button type="submit" disabled={!password} data-testid="button-submit-admin-login">Connexion</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---- Championship Title (inline edit — admin only) ----
function ChampionshipTitle({ championship, onRename }: { championship: Championship; onRename: (id: string, name: string) => void }) {
  const { isAdmin } = useAdmin();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(championship.name);

  const handleSave = () => { if (value.trim()) onRename(championship.id, value.trim()); setEditing(false); };
  const handleCancel = () => { setValue(championship.name); setEditing(false); };

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <Input value={value} onChange={(e) => setValue(e.target.value)} className="h-8 text-lg font-bold" autoFocus
          onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") handleCancel(); }}
          data-testid="input-championship-name" />
        <Button size="icon" variant="ghost" onClick={handleSave} data-testid="button-save-championship-name"><Check className="w-4 h-4" /></Button>
        <Button size="icon" variant="ghost" onClick={handleCancel} data-testid="button-cancel-championship-name"><X className="w-4 h-4" /></Button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <h2 className="text-xl font-bold">{championship.name}</h2>
      {isAdmin && (
        <Button size="icon" variant="ghost" onClick={() => { setValue(championship.name); setEditing(true); }}
          data-testid="button-edit-championship-name" aria-label="Renommer">
          <Pencil className="w-4 h-4 text-muted-foreground" />
        </Button>
      )}
    </div>
  );
}

// ---- Main Elo Leaderboard ----
function EloLeaderboard({ players, onAddPlayer, onEditPlayer, onDeletePlayer, onResetElo }: {
  players: Player[];
  onAddPlayer: (name: string, elo: number) => void;
  onEditPlayer: (id: string, name: string) => void;
  onDeletePlayer: (id: string) => void;
  onResetElo: (id: string) => void;
}) {
  const { isAdmin } = useAdmin();
  const [playerToDelete, setPlayerToDelete] = useState<Player | null>(null);
  const [playerToResetElo, setPlayerToResetElo] = useState<Player | null>(null);
  const [playerToEdit, setPlayerToEdit] = useState<Player | null>(null);

  const sorted = [...players].sort((a, b) => b.elo - a.elo);

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Trophy className="w-5 h-5 text-yellow-500" />;
    if (rank === 2) return <Medal className="w-5 h-5 text-gray-400" />;
    if (rank === 3) return <Medal className="w-5 h-5 text-orange-600" />;
    return null;
  };

  return (
    <>
      {isAdmin && (
        <div className="flex gap-2 mb-4">
          <AddPlayerDialog onAddPlayer={onAddPlayer} />
        </div>
      )}

      <div className="rounded-md border" data-testid="table-elo-leaderboard">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Rang</TableHead>
              <TableHead>Joueur</TableHead>
              <TableHead className="text-right">Elo</TableHead>
              <TableHead className="text-right">Parties</TableHead>
              <TableHead className="text-right">Facteur K</TableHead>
              {isAdmin && <TableHead className="w-28"></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 ? (
              <TableRow>
                <TableCell colSpan={isAdmin ? 6 : 5} className="text-center text-muted-foreground py-8">
                  Aucun joueur enregistré. Ajoutez votre premier joueur pour commencer.
                </TableCell>
              </TableRow>
            ) : (
              sorted.map((player, index) => {
                const rank = index + 1;
                return (
                  <TableRow key={player.id} data-testid={`row-player-${player.id}`}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">{getRankIcon(rank)}<span>{rank}</span></div>
                    </TableCell>
                    <TableCell className="font-medium" data-testid={`text-player-name-${player.id}`}>{player.name}</TableCell>
                    <TableCell className="text-right">
                      <span className="text-lg font-bold" data-testid={`text-player-elo-${player.id}`}>{Math.round(player.elo)}</span>
                    </TableCell>
                    <TableCell className="text-right" data-testid={`text-player-games-${player.id}`}>{player.gamesPlayed}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="secondary" data-testid={`badge-kfactor-${player.id}`}>K={getKFactor(player.gamesPlayed, player.elo)}</Badge>
                    </TableCell>
                    {isAdmin && (
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => setPlayerToEdit(player)}
                            data-testid={`button-edit-player-${player.id}`} aria-label="Modifier">
                            <Pencil className="w-4 h-4 text-muted-foreground" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setPlayerToResetElo(player)}
                            data-testid={`button-reset-elo-${player.id}`} aria-label="Réinitialiser Elo">
                            <RefreshCw className="w-4 h-4 text-muted-foreground" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setPlayerToDelete(player)}
                            data-testid={`button-delete-player-${player.id}`} aria-label="Supprimer">
                            <Trash2 className="w-4 h-4 text-muted-foreground" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={!!playerToDelete} onOpenChange={(open) => !open && setPlayerToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer le joueur ?</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer <strong>{playerToDelete?.name}</strong> ? Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={() => { onDeletePlayer(playerToDelete!.id); setPlayerToDelete(null); }}
              className="bg-destructive text-destructive-foreground">Supprimer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!playerToResetElo} onOpenChange={(open) => !open && setPlayerToResetElo(null)}>
        <AlertDialogContent data-testid="dialog-confirm-reset-elo">
          <AlertDialogHeader>
            <AlertDialogTitle>Réinitialiser l'Elo ?</AlertDialogTitle>
            <AlertDialogDescription>
              L'Elo de <strong>{playerToResetElo?.name}</strong> sera remis à 1200 et ses parties comptées à 0.
              Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={() => { onResetElo(playerToResetElo!.id); setPlayerToResetElo(null); }}
              className="bg-destructive text-destructive-foreground">Réinitialiser</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <EditPlayerDialog
        player={playerToEdit}
        open={!!playerToEdit}
        onOpenChange={(open) => !open && setPlayerToEdit(null)}
        onSave={(id, name) => onEditPlayer(id, name)}
      />
    </>
  );
}

// ---- Standings Table ----
// pointSystem: "league" = 2/1/0 (for leagues); "tournament" = 1/0.5/0 (for championships)
function StandingsTable({
  players,
  matches,
  pointSystem,
}: {
  players: Player[];
  matches: Match[];
  pointSystem: "league" | "tournament";
}) {
  const withStats = players.map((p) => {
    const { wins, draws, losses } = calcWDL(p.id, matches);
    const points = pointSystem === "tournament"
      ? calcTournamentPoints(p.id, matches)
      : calcLeaguePoints(p.id, matches);
    return { ...p, wins, draws, losses, points };
  });
  const sorted = [...withStats].sort((a, b) => b.points - a.points || b.wins - a.wins);

  const ptLabel = pointSystem === "tournament" ? "Pts" : "Pts";
  const ptDesc = pointSystem === "tournament"
    ? "Victoire = 1 pt · Nulle = ½ pt · Défaite = 0 pt"
    : "Victoire = 2 pts · Nulle = 1 pt · Défaite = 0 pt";

  if (sorted.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">{ptDesc}</p>
        <div className="text-center py-12 text-muted-foreground rounded-md border">
          {pointSystem === "tournament"
            ? "Aucun joueur inscrit dans ce championnat."
            : "Aucun joueur qualifié pour cette ligue."}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{ptDesc}</p>
      <div className="rounded-md border" data-testid="table-standings">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Rang</TableHead>
              <TableHead>Joueur</TableHead>
              <TableHead className="text-right">Elo</TableHead>
              <TableHead className="text-right">V</TableHead>
              <TableHead className="text-right">N</TableHead>
              <TableHead className="text-right">D</TableHead>
              <TableHead className="text-right">{ptLabel}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((p, i) => (
              <TableRow key={p.id} data-testid={`row-standings-${p.id}`}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    {i === 0 && p.points > 0 && <Trophy className="w-4 h-4 text-yellow-500" />}
                    <span>{i + 1}</span>
                  </div>
                </TableCell>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell className="text-right text-muted-foreground">{Math.round(p.elo)}</TableCell>
                <TableCell className="text-right text-green-600 dark:text-green-400 font-medium">{p.wins}</TableCell>
                <TableCell className="text-right text-muted-foreground">{p.draws}</TableCell>
                <TableCell className="text-right text-red-600 dark:text-red-400">{p.losses}</TableCell>
                <TableCell className="text-right">
                  <span className="font-bold text-primary" data-testid={`text-points-${p.id}`}>{p.points}</span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ---- Championship / League Panel ----
// isLeague: true  → auto-filtered by Elo, league points (2/1/0)
// isLeague: false → manual (all players), tournament points (1/0.5/0)
function ChampionshipPanel({
  championship,
  eligiblePlayers,
  allPlayers,
}: {
  championship: Championship;
  /** Players eligible to play in this tab (filtered by Elo for leagues, all for championships) */
  eligiblePlayers: Player[];
  allPlayers: Player[];
}) {
  const { toast } = useToast();
  const { isAdmin } = useAdmin();
  const [showReset, setShowReset] = useState(false);
  const isLeague = championship.eloMin !== null;

  const matchesQuery = useQuery<Match[]>({
    queryKey: ["/api/championships", championship.id, "matches"],
    queryFn: async () => {
      const res = await fetch(`/api/championships/${championship.id}/matches`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch matches");
      return res.json();
    },
  });
  const matches = matchesQuery.data ?? [];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/championships", championship.id, "matches"] });
    queryClient.invalidateQueries({ queryKey: ["/api/players"] });
  };

  const recordMatchMutation = useMutation({
    mutationFn: async (data: { whitePlayerId: string; blackPlayerId: string; result: MatchResult }) => {
      const res = await apiRequest("POST", `/api/championships/${championship.id}/matches`, data);
      return res.json();
    },
    onSuccess: () => { invalidate(); toast({ title: "Match enregistré" }); },
    onError: () => toast({ title: "Erreur", description: "Impossible d'enregistrer le match.", variant: "destructive" }),
  });

  const deleteMatchMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/matches/${id}`);
      return res.json();
    },
    onSuccess: () => { invalidate(); toast({ title: "Résultat supprimé" }); },
    onError: () => toast({ title: "Erreur", description: "Impossible de supprimer le résultat.", variant: "destructive" }),
  });

  const editMatchMutation = useMutation({
    mutationFn: async ({ matchId, newResult }: { matchId: string; newResult: MatchResult }) => {
      const match = matches.find((m) => m.id === matchId);
      if (!match) throw new Error("Match introuvable");
      await apiRequest("DELETE", `/api/matches/${matchId}`);
      const res = await apiRequest("POST", `/api/championships/${championship.id}/matches`, {
        whitePlayerId: match.whitePlayerId,
        blackPlayerId: match.blackPlayerId,
        result: newResult,
      });
      return res.json();
    },
    onSuccess: () => { invalidate(); toast({ title: "Résultat modifié" }); },
    onError: () => toast({ title: "Erreur", description: "Impossible de modifier le résultat.", variant: "destructive" }),
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/championships/${championship.id}/reset`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/championships", championship.id, "matches"] });
      toast({ title: isLeague ? "Ligue réinitialisée" : "Championnat réinitialisé",
        description: "Les matchs ont été supprimés. L'Elo des joueurs est conservé." });
    },
    onError: () => toast({ title: "Erreur", description: "Impossible de réinitialiser.", variant: "destructive" }),
  });

  // For RecordMatchDialog: for leagues, only show eligible players; for championships, show all
  const playersForDialog = eligiblePlayers.map((p) => ({ ...p, kFactor: getKFactor(p.gamesPlayed, p.elo) }));

  if (matchesQuery.isLoading) {
    return <div className="flex items-center justify-center py-16"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" /></div>;
  }

  const standingsTab = isLeague ? "Ligue" : "Classement";
  const resetLabel = isLeague ? "Réinitialiser la ligue" : "Réinitialiser le championnat";
  const resetDesc = isLeague
    ? `Tous les matchs de ${championship.name} seront supprimés. Le score Elo des joueurs ne sera pas modifié.`
    : `Tous les matchs de ${championship.name} seront supprimés. Le score Elo des joueurs ne sera pas modifié.`;

  return (
    <div className="space-y-4">
      {isAdmin && (
        <div className="flex flex-wrap gap-2 items-center justify-between">
          {playersForDialog.length >= 2 ? (
            <RecordMatchDialog
              players={playersForDialog}
              onRecordMatch={(white, black, result) =>
                recordMatchMutation.mutate({ whitePlayerId: white, blackPlayerId: black, result })
              }
            />
          ) : (
            <p className="text-sm text-muted-foreground italic">
              {isLeague
                ? "Au moins 2 joueurs doivent être éligibles pour cette ligue (selon leur Elo)."
                : "Ajoutez au moins 2 joueurs dans le système pour enregistrer un match."}
            </p>
          )}
          <Button variant="outline" onClick={() => setShowReset(true)} data-testid="button-reset-championship">
            <RotateCcw className="w-4 h-4 mr-2" />{resetLabel}
          </Button>
        </div>
      )}

      <Tabs defaultValue="standings">
        <TabsList data-testid="tabs-championship">
          <TabsTrigger value="standings" data-testid="tab-standings">{standingsTab}</TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-history">Historique ({matches.length})</TabsTrigger>
        </TabsList>

        {/* Standings / Ligue tab */}
        <TabsContent value="standings" className="mt-4">
          {/* For leagues: show only players currently eligible by Elo */}
          {/* For championships: show all players (but we pass eligiblePlayers = allPlayers) */}
          <StandingsTable
            players={eligiblePlayers}
            matches={matches}
            pointSystem={isLeague ? "league" : "tournament"}
          />
          {isLeague && eligiblePlayers.length < allPlayers.length && (
            <p className="mt-3 text-xs text-muted-foreground">
              Seuls les joueurs dont l'Elo est dans la plage de cette ligue sont affichés.
              Les autres apparaissent dans leur ligue respective.
            </p>
          )}
        </TabsContent>

        {/* Match history tab */}
        <TabsContent value="history" className="mt-4">
          {matches.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">Aucune partie enregistrée.</div>
          ) : (
            <div className="space-y-3">
              {matches.map((match) => {
                // Look up players from allPlayers (a player may have moved to another league)
                const white = allPlayers.find((p) => p.id === match.whitePlayerId);
                const black = allPlayers.find((p) => p.id === match.blackPlayerId);
                if (!white || !black) return null;
                return (
                  <MatchHistoryItem
                    key={match.id}
                    id={match.id}
                    whitePlayer={white.name}
                    blackPlayer={black.name}
                    result={match.result}
                    whiteEloDelta={match.whiteEloDelta}
                    blackEloDelta={match.blackEloDelta}
                    timestamp={new Date(match.timestamp)}
                    onDelete={isAdmin ? (id) => deleteMatchMutation.mutate(id) : undefined}
                    onEdit={isAdmin ? (id, newResult) => editMatchMutation.mutate({ matchId: id, newResult }) : undefined}
                  />
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <AlertDialog open={showReset} onOpenChange={setShowReset}>
        <AlertDialogContent data-testid="dialog-confirm-reset">
          <AlertDialogHeader>
            <AlertDialogTitle>{resetLabel} ?</AlertDialogTitle>
            <AlertDialogDescription>{resetDesc}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-reset">Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={() => { resetMutation.mutate(); setShowReset(false); }}
              data-testid="button-confirm-reset" className="bg-destructive text-destructive-foreground">
              Réinitialiser
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---- Main Home Page ----
export default function Home() {
  const { toast } = useToast();
  const { isAdmin, logout } = useAdmin();
  const [showAdminLogin, setShowAdminLogin] = useState(false);

  const playersQuery = useQuery<Player[]>({ queryKey: ["/api/players"] });
  const { data: championships = [], isLoading: champsLoading } = useQuery<Championship[]>({
    queryKey: ["/api/championships"],
  });

  const players = playersQuery.data ?? [];

  const invalidatePlayers = () => queryClient.invalidateQueries({ queryKey: ["/api/players"] });

  const addPlayerMutation = useMutation({
    mutationFn: async (data: { name: string; elo?: number }) => {
      const res = await apiRequest("POST", "/api/players", data);
      return res.json();
    },
    onSuccess: () => { invalidatePlayers(); toast({ title: "Joueur ajouté" }); },
    onError: () => toast({ title: "Erreur", description: "Impossible d'ajouter le joueur.", variant: "destructive" }),
  });

  const editPlayerMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const res = await apiRequest("PATCH", `/api/players/${id}`, { name });
      return res.json();
    },
    onSuccess: () => { invalidatePlayers(); toast({ title: "Joueur modifié" }); },
    onError: () => toast({ title: "Erreur", description: "Impossible de modifier le joueur.", variant: "destructive" }),
  });

  const deletePlayerMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/players/${id}`);
      return res.json();
    },
    onSuccess: () => { invalidatePlayers(); toast({ title: "Joueur supprimé" }); },
    onError: () => toast({ title: "Erreur", description: "Impossible de supprimer le joueur.", variant: "destructive" }),
  });

  const resetEloMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/players/${id}/reset-elo`);
      return res.json();
    },
    onSuccess: () => { invalidatePlayers(); toast({ title: "Elo réinitialisé à 1200" }); },
    onError: () => toast({ title: "Erreur", description: "Impossible de réinitialiser l'Elo.", variant: "destructive" }),
  });

  const renameMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const res = await apiRequest("PATCH", `/api/championships/${id}`, { name });
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/championships"] }); toast({ title: "Renommé" }); },
    onError: () => toast({ title: "Erreur", description: "Impossible de renommer.", variant: "destructive" }),
  });

  if (champsLoading || playersQuery.isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b sticky top-0 bg-background z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-3xl font-serif font-bold">Système Elo d'Échecs</h1>
              <p className="text-sm text-muted-foreground">de Saint-Louis de Gonzague</p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="icon" variant="ghost"
                onClick={() => isAdmin ? logout() : setShowAdminLogin(true)}
                data-testid="button-admin-toggle"
                aria-label={isAdmin ? "Déconnexion admin" : "Connexion admin"}
                title={isAdmin ? "Déconnexion admin" : "Accès administrateur"}
                className={isAdmin ? "text-primary" : "text-muted-foreground/50"}
              >
                {isAdmin ? <LockOpen className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
              </Button>
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <Tabs defaultValue="elo" className="space-y-6">
          <div className="overflow-x-auto">
            <TabsList className="flex w-max gap-1" data-testid="tabs-main">
              <TabsTrigger value="elo" data-testid="tab-elo">Classement Elo</TabsTrigger>
              {championships.map((champ) => (
                <TabsTrigger key={champ.id} value={champ.id} data-testid={`tab-championship-${champ.id}`}>
                  {champ.name}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {/* ── Main Elo Leaderboard ── */}
          <TabsContent value="elo" className="space-y-4 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <StatsCard icon={Users} label="Total Joueurs" value={players.length} />
              <StatsCard icon={Play} label="Parties Jouées" value={Math.floor(players.reduce((s, p) => s + p.gamesPlayed, 0) / 2)} />
              <StatsCard icon={TrendingUp} label="Elo Moyen"
                value={players.length > 0 ? Math.round(players.reduce((s, p) => s + p.elo, 0) / players.length) : 0} />
            </div>
            <EloLeaderboard
              players={players}
              onAddPlayer={(name, elo) => addPlayerMutation.mutate({ name, elo })}
              onEditPlayer={(id, name) => editPlayerMutation.mutate({ id, name })}
              onDeletePlayer={(id) => deletePlayerMutation.mutate(id)}
              onResetElo={(id) => resetEloMutation.mutate(id)}
            />
          </TabsContent>

          {/* ── Per-championship / league tabs ── */}
          {championships.map((champ) => {
            // Compute which players are eligible for this tab
            const eligible = getLeaguePlayers(champ, championships, players);
            return (
              <TabsContent key={champ.id} value={champ.id} className="space-y-4 mt-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <ChampionshipTitle championship={champ} onRename={(id, name) => renameMutation.mutate({ id, name })} />
                  {champ.eloMin !== null ? (
                    <Badge variant="secondary" className="text-xs">
                      Ligue · Elo {champ.eloMin}
                      {/* Show upper bound if exists */}
                      {(() => {
                        const sortedLeagues = championships.filter((c) => c.eloMin !== null).sort((a, b) => (a.eloMin ?? 0) - (b.eloMin ?? 0));
                        const idx = sortedLeagues.findIndex((l) => l.id === champ.id);
                        const next = sortedLeagues[idx + 1];
                        return next ? `–${(next.eloMin ?? 0) - 1}` : "+";
                      })()}
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-xs">Championnat · Inscription manuelle</Badge>
                  )}
                </div>
                <ChampionshipPanel
                  championship={champ}
                  eligiblePlayers={eligible}
                  allPlayers={players}
                />
              </TabsContent>
            );
          })}
        </Tabs>
      </main>

      <AdminLoginDialog open={showAdminLogin} onOpenChange={setShowAdminLogin} />
    </div>
  );
}
