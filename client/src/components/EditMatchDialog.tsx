import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import type { MatchResult } from "@/components/RecordMatchDialog";

interface EditMatchDialogProps {
  matchId: string | null;
  whitePlayer: string;
  blackPlayer: string;
  currentResult: MatchResult | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (matchId: string, newResult: MatchResult) => void;
}

export default function EditMatchDialog({
  matchId,
  whitePlayer,
  blackPlayer,
  currentResult,
  open,
  onOpenChange,
  onConfirm,
}: EditMatchDialogProps) {
  const [newResult, setNewResult] = useState<MatchResult | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleSelectResult = (result: MatchResult) => {
    setNewResult(result);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newResult && matchId) {
      setShowConfirm(true);
    }
  };

  const handleConfirm = () => {
    if (matchId && newResult) {
      onConfirm(matchId, newResult);
      setNewResult(null);
      setShowConfirm(false);
      onOpenChange(false);
    }
  };

  const resultLabel = (r: MatchResult) => {
    if (r === "white") return "Blancs Gagnent";
    if (r === "draw") return "Nulle";
    return "Noirs Gagnent";
  };

  return (
    <>
      <Dialog open={open && !showConfirm} onOpenChange={(o) => { if (!o) { setNewResult(null); } onOpenChange(o); }}>
        <DialogContent data-testid="dialog-edit-match">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Modifier le résultat</DialogTitle>
              <DialogDescription>
                <strong>{whitePlayer}</strong> (Blancs) vs <strong>{blackPlayer}</strong> (Noirs)
                <br />
                Résultat actuel : {currentResult ? resultLabel(currentResult) : "—"}
              </DialogDescription>
            </DialogHeader>

            <div className="py-6 space-y-3">
              <p className="text-sm font-medium">Nouveau résultat :</p>
              <div className="flex gap-2">
                {(["white", "draw", "black"] as MatchResult[]).map((r) => (
                  <Button
                    key={r}
                    type="button"
                    variant={newResult === r ? "default" : "outline"}
                    className="flex-1"
                    onClick={() => handleSelectResult(r)}
                    data-testid={`button-new-result-${r}`}
                  >
                    {resultLabel(r)}
                  </Button>
                ))}
              </div>
            </div>

            <DialogFooter>
              <Button
                type="submit"
                disabled={!newResult || newResult === currentResult}
                data-testid="button-submit-edit-match"
              >
                Modifier
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent data-testid="dialog-confirm-edit-match">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la modification ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le résultat de <strong>{whitePlayer}</strong> vs <strong>{blackPlayer}</strong> sera
              modifié en <strong>{newResult ? resultLabel(newResult) : ""}</strong>.
              Les points Elo seront recalculés automatiquement.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-edit-match" onClick={() => setShowConfirm(false)}>
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              data-testid="button-confirm-edit-match"
            >
              Confirmer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
