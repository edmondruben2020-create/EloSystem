import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface EditPlayerDialogProps {
  player: { id: string; name: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (id: string, name: string) => void;
}

export default function EditPlayerDialog({ player, open, onOpenChange, onSave }: EditPlayerDialogProps) {
  const [name, setName] = useState("");

  useEffect(() => {
    if (player) setName(player.name);
  }, [player]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (player && name.trim()) {
      onSave(player.id, name.trim());
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="dialog-edit-player">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Modifier le joueur</DialogTitle>
            <DialogDescription>
              Changez le nom du joueur. Le classement sera mis à jour automatiquement.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-player-name">Nouveau nom</Label>
              <Input
                id="edit-player-name"
                data-testid="input-edit-player-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" data-testid="button-submit-edit-player">
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
