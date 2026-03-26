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
import StatsCard from "@/components/StatsCard";
import AddPlayerDialog from "@/components/AddPlayerDialog";
import RecordMatchDialog, { type MatchResult } from "@/components/RecordMatchDialog";
import LeaderboardTable from "@/components/LeaderboardTable";
import MatchHistoryItem from "@/components/MatchHistoryItem";
import ThemeToggle from "@/components/ThemeToggle";
import { useAdmin } from "@/context/AdminContext";
import { Users, Play, TrendingUp, RotateCcw, Pencil, Check, X, Trophy, Lock, LockOpen, ShieldAlert } from "lucide-react";

// ---- Types ----

interface Championship {
  id: string;
  name: string;
}

interface Player {
  id: string;
  name: string;
  elo: number;
  gamesPlayed: number;
  championshipId: string;
}

interface PlayerWithKFactor extends Player {
  kFactor: number;
  tournamentPoints: number;
  leaguePoints: number;
  wins: number;
  draws: number;
  losses: number;
}

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

// ---- K-Factor ----
function getKFactor(gamesPlayed: number, elo: number): number {
  if (gamesPlayed < 30) return 40;
  if (elo >= 2400) return 10;
  return 20;
}

// ---- Points helpers ----

function calcTournamentPoints(playerId: string, matches: Match[]): number {
  return matches.reduce((total, m) => {
    if (m.whitePlayerId === playerId)
      return total + (m.result === "white" ? 1 : m.result === "draw" ? 0.5 : 0);
    if (m.blackPlayerId === playerId)
      return total + (m.result === "black" ? 1 : m.result === "draw" ? 0.5 : 0);
    return total;
  }, 0);
}

function calcLeaguePoints(playerId: string, matches: Match[]): number {
  return matches.reduce((total, m) => {
    if (m.whitePlayerId === playerId)
      return total + (m.result === "white" ? 2 : m.result === "draw" ? 1 : 0);
    if (m.blackPlayerId === playerId)
      return total + (m.result === "black" ? 2 : m.result === "draw" ? 1 : 0);
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
function AdminLoginDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { login } = useAdmin();
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const success = login(password);
    if (success) {
      setPassword("");
      setError(false);
      onOpenChange(false);
    } else {
      setError(true);
    }
  };

  const handleClose = () => {
    setPassword("");
    setError(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent data-testid="dialog-admin-login">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Accès administrateur</DialogTitle>
            <DialogDescription>
              Entrez le mot de passe pour activer les fonctions de modification.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <Label htmlFor="admin-password">Mot de passe</Label>
            <Input
              id="admin-password"
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(false); }}
              placeholder="••••••••••••••••"
              autoFocus
              data-testid="input-admin-password"
            />
            {error && (
              <p className="text-sm text-destructive flex items-center gap-1" data-testid="text-admin-error">
                <ShieldAlert className="w-4 h-4" />
                Mot de passe incorrect.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Annuler
            </Button>
            <Button type="submit" disabled={!password} data-testid="button-submit-admin-login">
              Connexion
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---- Championship Title (inline editable — edit only when admin) ----
function ChampionshipTitle({
  championship,
  onRename,
}: {
  championship: Championship;
  onRename: (id: string, name: string) => void;
}) {
  const { isAdmin } = useAdmin();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(championship.name);

  const handleSave = () => {
    if (value.trim()) onRename(championship.id, value.trim());
    setEditing(false);
  };

  const handleCancel = () => {
    setValue(championship.name);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="h-8 text-lg font-bold"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") handleCancel();
          }}
          data-testid="input-championship-name"
        />
        <Button size="icon" variant="ghost" onClick={handleSave} data-testid="button-save-championship-name">
          <Check className="w-4 h-4" />
        </Button>
        <Button size="icon" variant="ghost" onClick={handleCancel} data-testid="button-cancel-championship-name">
          <X className="w-4 h-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <h2 className="text-xl font-bold">{championship.name}</h2>
      {isAdmin && (
        <Button
          size="icon"
          variant="ghost"
          onClick={() => { setValue(championship.name); setEditing(true); }}
          data-testid="button-edit-championship-name"
          aria-label="Renommer le championnat"
        >
          <Pencil className="w-4 h-4 text-muted-foreground" />
        </Button>
      )}
    </div>
  );
}

// ---- League Table ----
function LeagueTable({ players }: { players: PlayerWithKFactor[] }) {
  const sorted = [...players].sort((a, b) => b.leaguePoints - a.leaguePoints || b.wins - a.wins);

  if (sorted.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground rounded-md border">
        Aucun joueur enregistré.
      </div>
    );
  }

  return (
    <div className="rounded-md border" data-testid="table-league">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">Rang</TableHead>
            <TableHead>Joueur</TableHead>
            <TableHead className="text-right">V</TableHead>
            <TableHead className="text-right">N</TableHead>
            <TableHead className="text-right">D</TableHead>
            <TableHead className="text-right">Pts Ligue</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((p, i) => (
            <TableRow key={p.id} data-testid={`row-league-${p.id}`}>
              <TableCell className="font-medium">
                <div className="flex items-center gap-2">
                  {i === 0 && <Trophy className="w-4 h-4 text-yellow-500" />}
                  <span>{i + 1}</span>
                </div>
              </TableCell>
              <TableCell className="font-medium">{p.name}</TableCell>
              <TableCell className="text-right text-green-600 dark:text-green-400 font-medium">{p.wins}</TableCell>
              <TableCell className="text-right text-muted-foreground">{p.draws}</TableCell>
              <TableCell className="text-right text-red-600 dark:text-red-400">{p.losses}</TableCell>
              <TableCell className="text-right">
                <span className="font-bold text-primary" data-testid={`text-league-points-${p.id}`}>
                  {p.leaguePoints}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ---- Championship Panel ----
function ChampionshipPanel({
  championship,
  isFirst,
}: {
  championship: Championship;
  isFirst: boolean;
}) {
  const { toast } = useToast();
  const { isAdmin } = useAdmin();
  const [showReset, setShowReset] = useState(false);

  const playersQuery = useQuery<Player[]>({
    queryKey: ["/api/championships", championship.id, "players"],
    queryFn: async () => {
      const res = await fetch(`/api/championships/${championship.id}/players`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch players");
      return res.json();
    },
  });

  const matchesQuery = useQuery<Match[]>({
    queryKey: ["/api/championships", championship.id, "matches"],
    queryFn: async () => {
      const res = await fetch(`/api/championships/${championship.id}/matches`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch matches");
      return res.json();
    },
  });

  const players = playersQuery.data ?? [];
  const matches = matchesQuery.data ?? [];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/championships", championship.id, "players"] });
    queryClient.invalidateQueries({ queryKey: ["/api/championships", championship.id, "matches"] });
  };

  const addPlayerMutation = useMutation({
    mutationFn: async (data: { name: string; elo?: number }) => {
      const res = await apiRequest("POST", `/api/championships/${championship.id}/players`, data);
      return res.json();
    },
    onSuccess: () => { invalidate(); toast({ title: "Joueur ajouté" }); },
    onError: () => toast({ title: "Erreur", description: "Impossible d'ajouter le joueur.", variant: "destructive" }),
  });

  const editPlayerMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const res = await apiRequest("PATCH", `/api/players/${id}`, { name });
      return res.json();
    },
    onSuccess: () => { invalidate(); toast({ title: "Joueur modifié" }); },
    onError: () => toast({ title: "Erreur", description: "Impossible de modifier le joueur.", variant: "destructive" }),
  });

  const deletePlayerMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/players/${id}`);
      return res.json();
    },
    onSuccess: () => { invalidate(); toast({ title: "Joueur supprimé" }); },
    onError: () => toast({ title: "Erreur", description: "Impossible de supprimer le joueur.", variant: "destructive" }),
  });

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
    onSuccess: () => { invalidate(); toast({ title: "Résultat supprimé", description: "Les points Elo ont été restaurés." }); },
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
    onSuccess: () => { invalidate(); toast({ title: "Résultat modifié", description: "Les points Elo ont été recalculés." }); },
    onError: () => toast({ title: "Erreur", description: "Impossible de modifier le résultat.", variant: "destructive" }),
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/championships/${championship.id}/reset`);
      return res.json();
    },
    onSuccess: () => { invalidate(); toast({ title: "Tournoi réinitialisé" }); },
    onError: () => toast({ title: "Erreur", description: "Impossible de réinitialiser.", variant: "destructive" }),
  });

  const playersWithStats: PlayerWithKFactor[] = players.map((p) => {
    const { wins, draws, losses } = calcWDL(p.id, matches);
    return {
      ...p,
      kFactor: getKFactor(p.gamesPlayed, p.elo),
      tournamentPoints: calcTournamentPoints(p.id, matches),
      leaguePoints: calcLeaguePoints(p.id, matches),
      wins,
      draws,
      losses,
    };
  });

  const avgElo = players.length > 0
    ? Math.round(players.reduce((s, p) => s + p.elo, 0) / players.length)
    : 0;

  if (playersQuery.isLoading || matchesQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatsCard icon={Users} label="Total Joueurs" value={players.length} />
        <StatsCard icon={Play} label="Parties Jouées" value={matches.length} />
        <StatsCard icon={TrendingUp} label="Elo Moyen" value={avgElo} />
      </div>

      {/* Action buttons — only visible when admin */}
      {isAdmin && (
        <div className="flex flex-wrap gap-2 items-center justify-between">
          <div className="flex flex-wrap gap-2">
            <AddPlayerDialog onAddPlayer={(name, elo) => addPlayerMutation.mutate({ name, elo })} />
            <RecordMatchDialog
              players={playersWithStats}
              onRecordMatch={(white, black, result) =>
                recordMatchMutation.mutate({ whitePlayerId: white, blackPlayerId: black, result })
              }
            />
          </div>
          {!isFirst && (
            <Button
              variant="outline"
              onClick={() => setShowReset(true)}
              data-testid="button-reset-championship"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Réinitialiser le tournoi
            </Button>
          )}
        </div>
      )}

      <Tabs defaultValue="leaderboard">
        <TabsList data-testid="tabs-championship">
          <TabsTrigger value="leaderboard" data-testid="tab-leaderboard">Classement</TabsTrigger>
          {!isFirst && (
            <TabsTrigger value="league" data-testid="tab-league">Ligue</TabsTrigger>
          )}
          <TabsTrigger value="history" data-testid="tab-history">
            Historique ({matches.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="leaderboard" className="mt-4">
          <LeaderboardTable
            players={playersWithStats}
            showPoints={!isFirst}
            onDeletePlayer={isAdmin ? (id) => deletePlayerMutation.mutate(id) : undefined}
            onEditPlayer={isAdmin ? (id, name) => editPlayerMutation.mutate({ id, name }) : undefined}
          />
        </TabsContent>

        {!isFirst && (
          <TabsContent value="league" className="mt-4">
            <p className="text-sm text-muted-foreground mb-4">
              Points de ligue : Victoire = 2 pts · Nulle = 1 pt · Défaite = 0 pt
            </p>
            <LeagueTable players={playersWithStats} />
          </TabsContent>
        )}

        <TabsContent value="history" className="mt-4">
          {matches.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Aucune partie enregistrée pour ce championnat.
            </div>
          ) : (
            <div className="space-y-3">
              {matches.map((match) => {
                const white = players.find((p) => p.id === match.whitePlayerId);
                const black = players.find((p) => p.id === match.blackPlayerId);
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
                    onEdit={isAdmin && !isFirst ? (id, newResult) => editMatchMutation.mutate({ matchId: id, newResult }) : undefined}
                  />
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {!isFirst && (
        <AlertDialog open={showReset} onOpenChange={setShowReset}>
          <AlertDialogContent data-testid="dialog-confirm-reset">
            <AlertDialogHeader>
              <AlertDialogTitle>Réinitialiser le tournoi ?</AlertDialogTitle>
              <AlertDialogDescription>
                Cette action remettra à zéro tous les scores Elo, les parties et le classement pour{" "}
                <strong>{championship.name}</strong>. Les joueurs seront conservés.
                Cette action est irréversible.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-reset">Annuler</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => { resetMutation.mutate(); setShowReset(false); }}
                data-testid="button-confirm-reset"
                className="bg-destructive text-destructive-foreground"
              >
                Réinitialiser
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

// ---- Main Home Page ----
export default function Home() {
  const { toast } = useToast();
  const { isAdmin, logout } = useAdmin();
  const [showAdminLogin, setShowAdminLogin] = useState(false);

  const { data: championships = [], isLoading } = useQuery<Championship[]>({
    queryKey: ["/api/championships"],
  });

  const renameMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const res = await apiRequest("PATCH", `/api/championships/${id}`, { name });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/championships"] });
      toast({ title: "Championnat renommé" });
    },
    onError: () => toast({ title: "Erreur", description: "Impossible de renommer.", variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b sticky top-0 bg-background z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-3xl font-serif font-bold">Système Elo d'Échecs</h1>
              <p className="text-sm text-muted-foreground">de Saint-Louis de Gonzague</p>
            </div>
            <div className="flex items-center gap-2">
              {/* Discreet admin button */}
              <Button
                size="icon"
                variant="ghost"
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
        <Tabs defaultValue={championships[0]?.id} className="space-y-6">
          <div className="overflow-x-auto">
            <TabsList className="flex w-max gap-1" data-testid="tabs-championships">
              {championships.map((champ) => (
                <TabsTrigger
                  key={champ.id}
                  value={champ.id}
                  data-testid={`tab-championship-${champ.id}`}
                >
                  {champ.name}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {championships.map((champ, index) => (
            <TabsContent key={champ.id} value={champ.id} className="space-y-6 mt-4">
              <ChampionshipTitle
                championship={champ}
                onRename={(id, name) => renameMutation.mutate({ id, name })}
              />
              <ChampionshipPanel championship={champ} isFirst={index === 0} />
            </TabsContent>
          ))}
        </Tabs>
      </main>

      <AdminLoginDialog open={showAdminLogin} onOpenChange={setShowAdminLogin} />
    </div>
  );
}
