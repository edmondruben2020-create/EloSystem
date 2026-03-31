import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
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
  Trophy, Medal, Lock, LockOpen, ShieldAlert, Trash2, RefreshCw, Plus,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Championship {
  id: string; name: string; position: number;
  eloMin: number | null; // null = manual championship; number = auto-league
  key: string | null;    // immutable slug for official entries
}
interface Player { id: string; name: string; elo: number; gamesPlayed: number; }
interface Match {
  id: string; championshipId: string;
  whitePlayerId: string; blackPlayerId: string; result: MatchResult;
  whiteEloDelta: number; blackEloDelta: number; timestamp: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const LEAGUE_PION_KEY = "ligue-pion";
const LEAGUE_ROI_KEY  = "ligue-roi";

function getKFactor(g: number, elo: number) { return g < 30 ? 40 : elo >= 2400 ? 10 : 20; }

/** Returns players eligible for a given entry. Leagues filter by Elo range; championships show all. */
function getEligiblePlayers(entry: Championship, allChampionships: Championship[], allPlayers: Player[]): Player[] {
  if (entry.eloMin === null) return allPlayers; // manual championship → all players
  const leagues = [...allChampionships]
    .filter((c) => c.eloMin !== null)
    .sort((a, b) => (a.eloMin ?? 0) - (b.eloMin ?? 0));
  const idx = leagues.findIndex((l) => l.id === entry.id);
  const min  = entry.eloMin ?? 0;
  const next = leagues[idx + 1];
  const max  = next ? (next.eloMin ?? Infinity) : Infinity;
  return allPlayers.filter((p) => p.elo >= min && p.elo < max);
}

// League points: 2/1/0 — for leagues
function calcLeaguePoints(pid: string, matches: Match[]) {
  return matches.reduce((t, m) => {
    if (m.whitePlayerId === pid) return t + (m.result === "white" ? 2 : m.result === "draw" ? 1 : 0);
    if (m.blackPlayerId === pid) return t + (m.result === "black" ? 2 : m.result === "draw" ? 1 : 0);
    return t;
  }, 0);
}

// Tournament points: 1/0.5/0 — for championships
function calcTournamentPoints(pid: string, matches: Match[]) {
  return matches.reduce((t, m) => {
    if (m.whitePlayerId === pid) return t + (m.result === "white" ? 1 : m.result === "draw" ? 0.5 : 0);
    if (m.blackPlayerId === pid) return t + (m.result === "black" ? 1 : m.result === "draw" ? 0.5 : 0);
    return t;
  }, 0);
}

function calcWDL(pid: string, matches: Match[]) {
  let wins = 0, draws = 0, losses = 0;
  matches.forEach((m) => {
    const w = m.whitePlayerId === pid, b = m.blackPlayerId === pid;
    if (!w && !b) return;
    if ((w && m.result === "white") || (b && m.result === "black")) wins++;
    else if (m.result === "draw") draws++;
    else losses++;
  });
  return { wins, draws, losses };
}

// ── Admin Login Dialog ─────────────────────────────────────────────────────────
function AdminLoginDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { login } = useAdmin();
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (login(password)) { setPassword(""); setError(false); onOpenChange(false); } else setError(true);
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
            <Label htmlFor="admin-pw">Mot de passe</Label>
            <Input id="admin-pw" type="password" value={password} autoFocus
              onChange={(e) => { setPassword(e.target.value); setError(false); }}
              data-testid="input-admin-password" />
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

// ── Create Championship Dialog ────────────────────────────────────────────────
function CreateChampionshipDialog({ open, onOpenChange, onCreate, existingNames }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  onCreate: (name: string) => Promise<void>;
  existingNames: string[];
}) {
  const [name, setName]   = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy]   = useState(false);

  const handleChange = (v: string) => { setName(v); setError(null); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) { setError("Le nom ne peut pas être vide."); return; }

    // Client-side duplicate guard (case-insensitive)
    const isDuplicate = existingNames.some((n) => n.toLowerCase() === trimmed.toLowerCase());
    if (isDuplicate) { setError(`Un championnat nommé "${trimmed}" existe déjà.`); return; }

    setBusy(true);
    try {
      await onCreate(trimmed);
      setName(""); setError(null); onOpenChange(false);
    } catch (err: any) {
      // Server may also return 409 if a race condition slipped through
      setError(err?.message ?? "Impossible de créer le championnat.");
    } finally {
      setBusy(false);
    }
  };

  const handleClose = () => { setName(""); setError(null); onOpenChange(false); };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent data-testid="dialog-create-championship">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Nouveau Championnat</DialogTitle>
            <DialogDescription>Championnat manuel — les joueurs s'inscrivent manuellement (points 1/½/0).</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-2">
            <Label htmlFor="champ-name">Nom du championnat</Label>
            <Input id="champ-name" value={name} autoFocus
              onChange={(e) => handleChange(e.target.value)}
              placeholder="ex: Championnat du Club" maxLength={100}
              data-testid="input-championship-name-new"
              aria-invalid={!!error} />
            {error && (
              <p className="text-sm text-destructive" data-testid="text-create-champ-error">{error}</p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={busy}>Annuler</Button>
            <Button type="submit" disabled={!name.trim() || busy} data-testid="button-submit-create-championship">
              {busy ? "Création…" : "Créer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Inline Title Rename ───────────────────────────────────────────────────────
function ChampionshipTitle({ championship, onRename }: {
  championship: Championship; onRename: (id: string, name: string) => void;
}) {
  const { isAdmin } = useAdmin();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(championship.name);
  const save = () => { if (value.trim()) onRename(championship.id, value.trim()); setEditing(false); };
  const cancel = () => { setValue(championship.name); setEditing(false); };
  if (editing) return (
    <div className="flex items-center gap-2">
      <Input value={value} onChange={(e) => setValue(e.target.value)} className="h-8 text-lg font-bold" autoFocus
        onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") cancel(); }}
        data-testid="input-rename-championship" />
      <Button size="icon" variant="ghost" onClick={save}><Check className="w-4 h-4" /></Button>
      <Button size="icon" variant="ghost" onClick={cancel}><X className="w-4 h-4" /></Button>
    </div>
  );
  return (
    <div className="flex items-center gap-2">
      <h2 className="text-xl font-bold">{championship.name}</h2>
      {isAdmin && (
        <Button size="icon" variant="ghost" onClick={() => { setValue(championship.name); setEditing(true); }}
          aria-label="Renommer" data-testid="button-rename-championship">
          <Pencil className="w-4 h-4 text-muted-foreground" />
        </Button>
      )}
    </div>
  );
}

// ── Standings Table ───────────────────────────────────────────────────────────
function StandingsTable({ players, matches, pointSystem }: {
  players: Player[]; matches: Match[]; pointSystem: "league" | "tournament";
}) {
  const withStats = players.map((p) => {
    const { wins, draws, losses } = calcWDL(p.id, matches);
    const points = pointSystem === "tournament"
      ? calcTournamentPoints(p.id, matches)
      : calcLeaguePoints(p.id, matches);
    return { ...p, wins, draws, losses, points };
  }).sort((a, b) => b.points - a.points || b.wins - a.wins);

  const desc = pointSystem === "tournament"
    ? "Victoire = 1 pt · Nulle = ½ pt · Défaite = 0 pt"
    : "Victoire = 2 pts · Nulle = 1 pt · Défaite = 0 pt";
  const emptyMsg = pointSystem === "tournament"
    ? "Aucun joueur dans ce championnat." : "Aucun joueur éligible pour cette ligue.";

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{desc}</p>
      {withStats.length === 0 ? (
        <div className="rounded-md border text-center py-12 text-muted-foreground">{emptyMsg}</div>
      ) : (
        <div className="rounded-md border" data-testid="table-standings">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-14">Rang</TableHead>
                <TableHead>Joueur</TableHead>
                <TableHead className="text-right">Elo</TableHead>
                <TableHead className="text-right">V</TableHead>
                <TableHead className="text-right">N</TableHead>
                <TableHead className="text-right">D</TableHead>
                <TableHead className="text-right">Pts</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {withStats.map((p, i) => (
                <TableRow key={p.id} data-testid={`row-standings-${p.id}`}>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {i === 0 && p.points > 0 && <Trophy className="w-4 h-4 text-yellow-500" />}
                      <span>{i + 1}</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{Math.round(p.elo)}</TableCell>
                  <TableCell className="text-right text-green-600 dark:text-green-400 font-medium">{p.wins}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{p.draws}</TableCell>
                  <TableCell className="text-right text-red-600 dark:text-red-400">{p.losses}</TableCell>
                  <TableCell className="text-right font-bold text-primary" data-testid={`text-points-${p.id}`}>{p.points}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ── Championship / League Panel ───────────────────────────────────────────────
function ChampionshipPanel({ championship, eligiblePlayers, allPlayers, onDelete }: {
  championship: Championship;
  eligiblePlayers: Player[];
  allPlayers: Player[];
  onDelete?: () => void;
}) {
  const { toast } = useToast();
  const { isAdmin } = useAdmin();
  const [showReset, setShowReset] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const isLeague = championship.eloMin !== null;
  const isOfficial = championship.key === LEAGUE_PION_KEY || championship.key === LEAGUE_ROI_KEY;

  const matchesQuery = useQuery<Match[]>({
    queryKey: ["/api/championships", championship.id, "matches"],
    queryFn: async () => {
      const res = await fetch(`/api/championships/${championship.id}/matches`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });
  const matches = matchesQuery.data ?? [];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/championships", championship.id, "matches"] });
    queryClient.invalidateQueries({ queryKey: ["/api/players"] });
  };

  const recordMutation = useMutation({
    mutationFn: async (d: { whitePlayerId: string; blackPlayerId: string; result: MatchResult }) => {
      const r = await apiRequest("POST", `/api/championships/${championship.id}/matches`, d);
      return r.json();
    },
    onSuccess: () => { invalidate(); toast({ title: "Match enregistré" }); },
    onError: () => toast({ title: "Erreur", description: "Impossible d'enregistrer.", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { const r = await apiRequest("DELETE", `/api/matches/${id}`); return r.json(); },
    onSuccess: () => { invalidate(); toast({ title: "Résultat supprimé" }); },
    onError: () => toast({ title: "Erreur", description: "Impossible de supprimer.", variant: "destructive" }),
  });

  const editMutation = useMutation({
    mutationFn: async ({ matchId, newResult }: { matchId: string; newResult: MatchResult }) => {
      const m = matches.find((x) => x.id === matchId);
      if (!m) throw new Error("introuvable");
      await apiRequest("DELETE", `/api/matches/${matchId}`);
      const r = await apiRequest("POST", `/api/championships/${championship.id}/matches`, {
        whitePlayerId: m.whitePlayerId, blackPlayerId: m.blackPlayerId, result: newResult,
      });
      return r.json();
    },
    onSuccess: () => { invalidate(); toast({ title: "Résultat modifié" }); },
    onError: () => toast({ title: "Erreur", description: "Impossible de modifier.", variant: "destructive" }),
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/championships/${championship.id}/reset`);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/championships", championship.id, "matches"] });
      toast({ title: isLeague ? "Ligue réinitialisée" : "Championnat réinitialisé",
        description: "Matchs supprimés. Elo conservé." });
    },
    onError: () => toast({ title: "Erreur", variant: "destructive" }),
  });

  const playersForDialog = eligiblePlayers.map((p) => ({ ...p, kFactor: getKFactor(p.gamesPlayed, p.elo) }));

  if (matchesQuery.isLoading)
    return <div className="flex items-center justify-center py-16"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" /></div>;

  return (
    <div className="space-y-4">
      {isAdmin && (
        <div className="flex flex-wrap gap-2 items-center justify-between">
          <div className="flex flex-wrap gap-2">
            {playersForDialog.length >= 2 ? (
              <RecordMatchDialog players={playersForDialog}
                onRecordMatch={(w, b, r) => recordMutation.mutate({ whitePlayerId: w, blackPlayerId: b, result: r })} />
            ) : (
              <p className="text-sm text-muted-foreground italic self-center">
                {isLeague ? "Au moins 2 joueurs doivent être éligibles (par Elo)." : "Au moins 2 joueurs requis."}
              </p>
            )}
            <Button variant="outline" onClick={() => setShowReset(true)} data-testid="button-reset-championship">
              <RotateCcw className="w-4 h-4 mr-2" />
              {isLeague ? "Réinitialiser la ligue" : "Réinitialiser"}
            </Button>
          </div>
          {/* Delete button — only for manually created championships */}
          {!isOfficial && onDelete && (
            <Button variant="outline" onClick={() => setShowDelete(true)}
              data-testid="button-delete-championship" className="text-destructive border-destructive/30 hover:bg-destructive/10">
              <Trash2 className="w-4 h-4 mr-2" />Supprimer le championnat
            </Button>
          )}
        </div>
      )}

      <Tabs defaultValue="standings">
        <TabsList>
          <TabsTrigger value="standings">{isLeague ? "Ligue" : "Classement"}</TabsTrigger>
          <TabsTrigger value="history">Historique ({matches.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="standings" className="mt-4">
          <StandingsTable players={eligiblePlayers} matches={matches}
            pointSystem={isLeague ? "league" : "tournament"} />
          {isLeague && eligiblePlayers.length < allPlayers.length && (
            <p className="mt-3 text-xs text-muted-foreground">
              Seuls les joueurs dont l'Elo est dans la plage de cette ligue sont affichés.
            </p>
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          {matches.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">Aucune partie enregistrée.</div>
          ) : (
            <div className="space-y-3">
              {matches.map((m) => {
                const w = allPlayers.find((p) => p.id === m.whitePlayerId);
                const b = allPlayers.find((p) => p.id === m.blackPlayerId);
                if (!w || !b) return null;
                return (
                  <MatchHistoryItem key={m.id} id={m.id}
                    whitePlayer={w.name} blackPlayer={b.name}
                    result={m.result}
                    whiteEloDelta={m.whiteEloDelta} blackEloDelta={m.blackEloDelta}
                    timestamp={new Date(m.timestamp)}
                    onDelete={isAdmin ? (id) => deleteMutation.mutate(id) : undefined}
                    onEdit={isAdmin ? (id, r) => editMutation.mutate({ matchId: id, newResult: r }) : undefined}
                  />
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Confirm reset */}
      <AlertDialog open={showReset} onOpenChange={setShowReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Réinitialiser {championship.name} ?</AlertDialogTitle>
            <AlertDialogDescription>
              Tous les matchs seront supprimés. <strong>L'Elo des joueurs n'est pas modifié.</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={() => { resetMutation.mutate(); setShowReset(false); }}
              className="bg-destructive text-destructive-foreground">Réinitialiser</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm delete championship */}
      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer le championnat ?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{championship.name}</strong> et tous ses matchs seront supprimés définitivement.
              L'Elo des joueurs reste intact.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={() => { onDelete?.(); setShowDelete(false); }}
              className="bg-destructive text-destructive-foreground">Supprimer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Global Elo Leaderboard ─────────────────────────────────────────────────────
function EloLeaderboard({ players, onAddPlayer, onEditPlayer, onDeletePlayer, onResetElo }: {
  players: Player[];
  onAddPlayer: (name: string, elo: number) => void;
  onEditPlayer: (id: string, name: string) => void;
  onDeletePlayer: (id: string) => void;
  onResetElo: (id: string) => void;
}) {
  const { isAdmin } = useAdmin();
  const [toDelete, setToDelete] = useState<Player | null>(null);
  const [toReset, setToReset]   = useState<Player | null>(null);
  const [toEdit, setToEdit]     = useState<Player | null>(null);

  const sorted = [...players].sort((a, b) => b.elo - a.elo);
  const rankIcon = (r: number) =>
    r === 1 ? <Trophy className="w-5 h-5 text-yellow-500" /> :
    r === 2 ? <Medal  className="w-5 h-5 text-gray-400"   /> :
    r === 3 ? <Medal  className="w-5 h-5 text-orange-600" /> : null;

  return (
    <>
      {isAdmin && <div className="flex gap-2 mb-4"><AddPlayerDialog onAddPlayer={onAddPlayer} /></div>}

      <div className="rounded-md border" data-testid="table-elo-leaderboard">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Rang</TableHead>
              <TableHead>Joueur</TableHead>
              <TableHead className="text-right">Elo</TableHead>
              <TableHead className="text-right">Parties</TableHead>
              <TableHead className="text-right">K</TableHead>
              {isAdmin && <TableHead className="w-28"></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 ? (
              <TableRow>
                <TableCell colSpan={isAdmin ? 6 : 5} className="text-center py-8 text-muted-foreground">
                  Aucun joueur. Ajoutez votre premier joueur pour commencer.
                </TableCell>
              </TableRow>
            ) : sorted.map((p, i) => (
              <TableRow key={p.id} data-testid={`row-player-${p.id}`}>
                <TableCell>
                  <div className="flex items-center gap-1">{rankIcon(i + 1)}<span>{i + 1}</span></div>
                </TableCell>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell className="text-right">
                  <span className="text-lg font-bold">{Math.round(p.elo)}</span>
                </TableCell>
                <TableCell className="text-right">{p.gamesPlayed}</TableCell>
                <TableCell className="text-right">
                  <Badge variant="secondary">K={getKFactor(p.gamesPlayed, p.elo)}</Badge>
                </TableCell>
                {isAdmin && (
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => setToEdit(p)} aria-label="Modifier">
                        <Pencil className="w-4 h-4 text-muted-foreground" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setToReset(p)} aria-label="Réinitialiser Elo">
                        <RefreshCw className="w-4 h-4 text-muted-foreground" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setToDelete(p)} aria-label="Supprimer">
                        <Trash2 className="w-4 h-4 text-muted-foreground" />
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer {toDelete?.name} ?</AlertDialogTitle>
            <AlertDialogDescription>Cette action est irréversible.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={() => { onDeletePlayer(toDelete!.id); setToDelete(null); }}
              className="bg-destructive text-destructive-foreground">Supprimer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!toReset} onOpenChange={(o) => !o && setToReset(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Réinitialiser l'Elo ?</AlertDialogTitle>
            <AlertDialogDescription>
              L'Elo de <strong>{toReset?.name}</strong> sera remis à 1200 et ses parties à 0.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={() => { onResetElo(toReset!.id); setToReset(null); }}
              className="bg-destructive text-destructive-foreground">Réinitialiser</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <EditPlayerDialog player={toEdit} open={!!toEdit} onOpenChange={(o) => !o && setToEdit(null)}
        onSave={(id, name) => onEditPlayer(id, name)} />
    </>
  );
}

// ── Home Page ──────────────────────────────────────────────────────────────────
export default function Home() {
  const { toast } = useToast();
  const { isAdmin, logout } = useAdmin();
  const [showAdminLogin, setShowAdminLogin]   = useState(false);
  const [showCreateChamp, setShowCreateChamp] = useState(false);

  const playersQuery = useQuery<Player[]>({ queryKey: ["/api/players"] });
  const champsQuery  = useQuery<Championship[]>({ queryKey: ["/api/championships"] });

  const players = playersQuery.data ?? [];
  const allChampionships = champsQuery.data ?? [];

  // Separate leagues (fixed) from manual championships
  const leagues       = allChampionships.filter((c) => c.eloMin !== null);
  const manualChamps  = allChampionships.filter((c) => c.eloMin === null);

  // Lookup official leagues by key (stable even after rename)
  const liguePion = leagues.find((l) => l.key === LEAGUE_PION_KEY);
  const ligueRoi  = leagues.find((l) => l.key === LEAGUE_ROI_KEY);

  const invalidatePlayers = () => queryClient.invalidateQueries({ queryKey: ["/api/players"] });
  const invalidateChamps  = () => queryClient.invalidateQueries({ queryKey: ["/api/championships"] });

  const addPlayer = useMutation({
    mutationFn: async (d: { name: string; elo?: number }) => (await apiRequest("POST", "/api/players", d)).json(),
    onSuccess: () => { invalidatePlayers(); toast({ title: "Joueur ajouté" }); },
    onError:   () => toast({ title: "Erreur", description: "Impossible d'ajouter.", variant: "destructive" }),
  });
  const editPlayer = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => (await apiRequest("PATCH", `/api/players/${id}`, { name })).json(),
    onSuccess: () => { invalidatePlayers(); toast({ title: "Joueur modifié" }); },
    onError:   () => toast({ title: "Erreur", variant: "destructive" }),
  });
  const deletePlayer = useMutation({
    mutationFn: async (id: string) => (await apiRequest("DELETE", `/api/players/${id}`)).json(),
    onSuccess: () => { invalidatePlayers(); toast({ title: "Joueur supprimé" }); },
    onError:   () => toast({ title: "Erreur", variant: "destructive" }),
  });
  const resetElo = useMutation({
    mutationFn: async (id: string) => (await apiRequest("POST", `/api/players/${id}/reset-elo`)).json(),
    onSuccess: () => { invalidatePlayers(); toast({ title: "Elo réinitialisé à 1200" }); },
    onError:   () => toast({ title: "Erreur", variant: "destructive" }),
  });
  const renameChamp = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => (await apiRequest("PATCH", `/api/championships/${id}`, { name })).json(),
    onSuccess: () => { invalidateChamps(); toast({ title: "Renommé" }); },
    onError:   () => toast({ title: "Erreur", variant: "destructive" }),
  });
  const createChamp = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", "/api/championships", { name });
      const body = await res.json();
      if (!res.ok) {
        // Re-throw with the server's error message so the dialog can display it
        throw new Error(body?.error ?? "Impossible de créer le championnat.");
      }
      return body;
    },
    onSuccess: () => { invalidateChamps(); toast({ title: "Championnat créé" }); },
    // onError is intentionally omitted — the dialog handles the error inline
  });
  const deleteChamp = useMutation({
    mutationFn: async (id: string) => (await apiRequest("DELETE", `/api/championships/${id}`)).json(),
    onSuccess: () => { invalidateChamps(); toast({ title: "Championnat supprimé" }); },
    onError:   () => toast({ title: "Erreur", variant: "destructive" }),
  });

  if (champsQuery.isLoading || playersQuery.isLoading)
    return <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
    </div>;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b sticky top-0 bg-background z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-serif font-bold">Système Elo d'Échecs</h1>
            <p className="text-sm text-muted-foreground">de Saint-Louis de Gonzague</p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="icon" variant="ghost"
              onClick={() => isAdmin ? logout() : setShowAdminLogin(true)}
              title={isAdmin ? "Déconnexion admin" : "Accès administrateur"}
              className={isAdmin ? "text-primary" : "text-muted-foreground/50"}
              data-testid="button-admin-toggle">
              {isAdmin ? <LockOpen className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <Tabs defaultValue="elo" className="space-y-6">

          {/* Tab bar: Classement Elo · Ligue Pion · Ligue Roi · [manual championships] · + */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <TabsList className="flex w-max gap-1 shrink-0" data-testid="tabs-main">
              {/* Fixed tab 1 — Global Elo */}
              <TabsTrigger value="elo" data-testid="tab-elo">Classement Elo</TabsTrigger>

              {/* Fixed tab 2 — Ligue Pion */}
              {liguePion && (
                <TabsTrigger value={liguePion.id} data-testid="tab-ligue-pion">
                  {liguePion.name}
                  <Badge variant="secondary" className="ml-1.5 text-xs no-default-active-elevate">
                    Elo 0–899
                  </Badge>
                </TabsTrigger>
              )}

              {/* Fixed tab 3 — Ligue Roi */}
              {ligueRoi && (
                <TabsTrigger value={ligueRoi.id} data-testid="tab-ligue-roi">
                  {ligueRoi.name}
                  <Badge variant="secondary" className="ml-1.5 text-xs no-default-active-elevate">
                    Elo 900+
                  </Badge>
                </TabsTrigger>
              )}

              {/* Dynamic tabs — manually created championships */}
              {manualChamps.map((c) => (
                <TabsTrigger key={c.id} value={c.id} data-testid={`tab-championship-${c.id}`}>
                  {c.name}
                </TabsTrigger>
              ))}
            </TabsList>

            {/* Create championship button (admin only) — outside TabsList so it's not a trigger */}
            {isAdmin && (
              <Button variant="outline" size="sm" onClick={() => setShowCreateChamp(true)}
                data-testid="button-create-championship" className="shrink-0">
                <Plus className="w-4 h-4 mr-1" />Nouveau Championnat
              </Button>
            )}
          </div>

          {/* ── Classement Elo ── */}
          <TabsContent value="elo" className="space-y-4 mt-2">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <StatsCard icon={Users} label="Total Joueurs" value={players.length} />
              <StatsCard icon={Play}  label="Parties Jouées" value={Math.floor(players.reduce((s, p) => s + p.gamesPlayed, 0) / 2)} />
              <StatsCard icon={TrendingUp} label="Elo Moyen"
                value={players.length > 0 ? Math.round(players.reduce((s, p) => s + p.elo, 0) / players.length) : 0} />
            </div>
            <EloLeaderboard players={players}
              onAddPlayer={(name, elo) => addPlayer.mutate({ name, elo })}
              onEditPlayer={(id, name) => editPlayer.mutate({ id, name })}
              onDeletePlayer={(id) => deletePlayer.mutate(id)}
              onResetElo={(id) => resetElo.mutate(id)} />
          </TabsContent>

          {/* ── Ligue Pion ── */}
          {liguePion && (
            <TabsContent value={liguePion.id} className="space-y-4 mt-2">
              <ChampionshipTitle championship={liguePion}
                onRename={(id, name) => renameChamp.mutate({ id, name })} />
              <ChampionshipPanel
                championship={liguePion}
                eligiblePlayers={getEligiblePlayers(liguePion, allChampionships, players)}
                allPlayers={players} />
            </TabsContent>
          )}

          {/* ── Ligue Roi ── */}
          {ligueRoi && (
            <TabsContent value={ligueRoi.id} className="space-y-4 mt-2">
              <ChampionshipTitle championship={ligueRoi}
                onRename={(id, name) => renameChamp.mutate({ id, name })} />
              <ChampionshipPanel
                championship={ligueRoi}
                eligiblePlayers={getEligiblePlayers(ligueRoi, allChampionships, players)}
                allPlayers={players} />
            </TabsContent>
          )}

          {/* ── Manual Championships ── */}
          {manualChamps.map((champ) => (
            <TabsContent key={champ.id} value={champ.id} className="space-y-4 mt-2">
              <ChampionshipTitle championship={champ}
                onRename={(id, name) => renameChamp.mutate({ id, name })} />
              <ChampionshipPanel
                championship={champ}
                eligiblePlayers={getEligiblePlayers(champ, allChampionships, players)}
                allPlayers={players}
                onDelete={() => deleteChamp.mutate(champ.id)} />
            </TabsContent>
          ))}
        </Tabs>
      </main>

      <AdminLoginDialog open={showAdminLogin} onOpenChange={setShowAdminLogin} />
      <CreateChampionshipDialog
        open={showCreateChamp}
        onOpenChange={setShowCreateChamp}
        existingNames={allChampionships.map((c) => c.name)}
        onCreate={(name) => createChamp.mutateAsync(name)}
      />
    </div>
  );
}
