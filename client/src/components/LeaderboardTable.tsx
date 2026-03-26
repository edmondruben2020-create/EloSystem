import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import EditPlayerDialog from "@/components/EditPlayerDialog";
import { Trophy, Medal, Trash2, Pencil } from "lucide-react";

interface Player {
  id: string;
  name: string;
  elo: number;
  gamesPlayed: number;
  kFactor: number;
  tournamentPoints?: number; // 1/0.5/0 per game, accumulated
}

interface LeaderboardTableProps {
  players: Player[];
  showPoints?: boolean; // show the Point(s) column
  onDeletePlayer?: (id: string) => void;
  onEditPlayer?: (id: string, name: string) => void;
}

export default function LeaderboardTable({
  players,
  showPoints = false,
  onDeletePlayer,
  onEditPlayer,
}: LeaderboardTableProps) {
  const [playerToDelete, setPlayerToDelete] = useState<Player | null>(null);
  const [playerToEdit, setPlayerToEdit] = useState<Player | null>(null);

  // Sort by tournament points if shown, otherwise by Elo
  const sortedPlayers = [...players].sort((a, b) =>
    showPoints
      ? (b.tournamentPoints ?? 0) - (a.tournamentPoints ?? 0) || b.elo - a.elo
      : b.elo - a.elo
  );

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Trophy className="w-5 h-5 text-yellow-500" />;
    if (rank === 2) return <Medal className="w-5 h-5 text-gray-400" />;
    if (rank === 3) return <Medal className="w-5 h-5 text-orange-600" />;
    return null;
  };

  const handleConfirmDelete = () => {
    if (playerToDelete && onDeletePlayer) {
      onDeletePlayer(playerToDelete.id);
    }
    setPlayerToDelete(null);
  };

  const hasActions = !!(onDeletePlayer || onEditPlayer);
  // Column count for empty state colspan
  const colSpan = 5 + (showPoints ? 1 : 0) + (hasActions ? 1 : 0);

  return (
    <>
      <div className="rounded-md border" data-testid="table-leaderboard">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Rang</TableHead>
              <TableHead>Joueur</TableHead>
              {showPoints && <TableHead className="text-right">Point(s)</TableHead>}
              <TableHead className="text-right">Elo</TableHead>
              <TableHead className="text-right">Parties</TableHead>
              <TableHead className="text-right">Facteur K</TableHead>
              {hasActions && <TableHead className="w-20"></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedPlayers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colSpan} className="text-center text-muted-foreground py-8">
                  Aucun joueur enregistré. Ajoutez votre premier joueur pour commencer.
                </TableCell>
              </TableRow>
            ) : (
              sortedPlayers.map((player, index) => {
                const rank = index + 1;
                return (
                  <TableRow key={player.id} data-testid={`row-player-${player.id}`}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {getRankIcon(rank)}
                        <span>{rank}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium" data-testid={`text-player-name-${player.id}`}>
                      {player.name}
                    </TableCell>
                    {showPoints && (
                      <TableCell className="text-right">
                        <span className="font-bold text-primary" data-testid={`text-player-points-${player.id}`}>
                          {player.tournamentPoints ?? 0}
                        </span>
                      </TableCell>
                    )}
                    <TableCell className="text-right">
                      <span className="text-lg font-bold" data-testid={`text-player-elo-${player.id}`}>
                        {Math.round(player.elo)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right" data-testid={`text-player-games-${player.id}`}>
                      {player.gamesPlayed}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="secondary" data-testid={`badge-kfactor-${player.id}`}>
                        K={player.kFactor}
                      </Badge>
                    </TableCell>
                    {hasActions && (
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          {onEditPlayer && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setPlayerToEdit(player)}
                              data-testid={`button-edit-player-${player.id}`}
                              aria-label={`Modifier ${player.name}`}
                            >
                              <Pencil className="w-4 h-4 text-muted-foreground" />
                            </Button>
                          )}
                          {onDeletePlayer && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setPlayerToDelete(player)}
                              data-testid={`button-delete-player-${player.id}`}
                              aria-label={`Supprimer ${player.name}`}
                            >
                              <Trash2 className="w-4 h-4 text-muted-foreground" />
                            </Button>
                          )}
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
        <AlertDialogContent data-testid="dialog-confirm-delete-player">
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer le joueur ?</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer <strong>{playerToDelete?.name}</strong> ?
              Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-player">Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              data-testid="button-confirm-delete-player"
              className="bg-destructive text-destructive-foreground"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <EditPlayerDialog
        player={playerToEdit}
        open={!!playerToEdit}
        onOpenChange={(open) => !open && setPlayerToEdit(null)}
        onSave={(id, name) => onEditPlayer?.(id, name)}
      />
    </>
  );
}
