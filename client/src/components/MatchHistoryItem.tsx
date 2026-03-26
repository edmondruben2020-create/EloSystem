import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
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
import { ArrowUp, ArrowDown, Minus, Trash2, Pencil } from "lucide-react";
import EditMatchDialog from "@/components/EditMatchDialog";
import type { MatchResult } from "@/components/RecordMatchDialog";

interface MatchHistoryItemProps {
  id: string;
  whitePlayer: string;
  blackPlayer: string;
  result: MatchResult;
  whiteEloDelta: number;
  blackEloDelta: number;
  timestamp: Date;
  onDelete?: (id: string) => void;
  onEdit?: (id: string, newResult: MatchResult) => void;
}

export default function MatchHistoryItem({
  id,
  whitePlayer,
  blackPlayer,
  result,
  whiteEloDelta,
  blackEloDelta,
  timestamp,
  onDelete,
  onEdit,
}: MatchHistoryItemProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  const getDeltaDisplay = (delta: number) => {
    const rounded = Math.round(delta);
    if (rounded > 0) {
      return (
        <span className="text-green-600 dark:text-green-400 flex items-center gap-1 font-semibold text-sm">
          <ArrowUp className="w-3 h-3" />+{rounded}
        </span>
      );
    } else if (rounded < 0) {
      return (
        <span className="text-red-600 dark:text-red-400 flex items-center gap-1 font-semibold text-sm">
          <ArrowDown className="w-3 h-3" />{rounded}
        </span>
      );
    }
    return (
      <span className="text-muted-foreground flex items-center gap-1 font-semibold text-sm">
        <Minus className="w-3 h-3" />0
      </span>
    );
  };

  const getResultBadge = () => {
    if (result === "white") return <Badge variant="default">1-0</Badge>;
    if (result === "black") return <Badge variant="default">0-1</Badge>;
    return <Badge variant="secondary">½-½</Badge>;
  };

  return (
    <>
      <Card data-testid={`card-match-${id}`}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium truncate" data-testid={`text-white-player-${id}`}>
                  {whitePlayer}
                </span>
                <span data-testid={`text-white-delta-${id}`}>{getDeltaDisplay(whiteEloDelta)}</span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="font-medium truncate" data-testid={`text-black-player-${id}`}>
                  {blackPlayer}
                </span>
                <span data-testid={`text-black-delta-${id}`}>{getDeltaDisplay(blackEloDelta)}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div data-testid={`badge-result-${id}`}>{getResultBadge()}</div>
              <time className="text-sm text-muted-foreground whitespace-nowrap" data-testid={`text-timestamp-${id}`}>
                {timestamp.toLocaleDateString('fr-FR', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </time>
              {onEdit && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowEdit(true)}
                  data-testid={`button-edit-match-${id}`}
                  aria-label="Modifier ce résultat"
                >
                  <Pencil className="w-4 h-4 text-muted-foreground" />
                </Button>
              )}
              {onDelete && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowDeleteConfirm(true)}
                  data-testid={`button-delete-match-${id}`}
                  aria-label="Supprimer ce match"
                >
                  <Trash2 className="w-4 h-4 text-muted-foreground" />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent data-testid="dialog-confirm-delete-match">
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce résultat ?</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer la partie <strong>{whitePlayer}</strong> vs <strong>{blackPlayer}</strong> ?
              Les points Elo seront restaurés à leur valeur avant la partie.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-match">Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { onDelete?.(id); setShowDeleteConfirm(false); }}
              data-testid="button-confirm-delete-match"
              className="bg-destructive text-destructive-foreground"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <EditMatchDialog
        matchId={id}
        whitePlayer={whitePlayer}
        blackPlayer={blackPlayer}
        currentResult={result}
        open={showEdit}
        onOpenChange={setShowEdit}
        onConfirm={(matchId, newResult) => onEdit?.(matchId, newResult)}
      />
    </>
  );
}
