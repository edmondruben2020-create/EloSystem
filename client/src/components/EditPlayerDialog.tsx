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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface LeagueOption { key: string; name: string; }

interface EditPlayerDialogProps {
  player: { id: string; name: string; leagueKey?: string | null } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (id: string, name: string, leagueKey: string | null) => void;
  leagues?: LeagueOption[];
}

export default function EditPlayerDialog({
  player, open, onOpenChange, onSave, leagues = [],
}: EditPlayerDialogProps) {
  const [name, setName] = useState("");
  const [leagueKey, setLeagueKey] = useState<string>("__none__");

  useEffect(() => {
    if (player) {
      setName(player.name);
      setLeagueKey(player.leagueKey ?? "__none__");
    }
  }, [player]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (player && name.trim()) {
      onSave(player.id, name.trim(), leagueKey === "__none__" ? null : leagueKey);
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
              Changez le nom et/ou la ligue du joueur.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-player-name">Nom</Label>
              <Input
                id="edit-player-name"
                data-testid="input-edit-player-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            {leagues.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="edit-league-select">Ligue</Label>
                <Select value={leagueKey} onValueChange={setLeagueKey}>
                  <SelectTrigger id="edit-league-select" data-testid="select-edit-player-league">
                    <SelectValue placeholder="Sélectionner une ligue" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Aucune affectation</SelectItem>
                    {leagues.map((l) => (
                      <SelectItem key={l.key} value={l.key}>{l.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
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
