import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { UserPlus } from "lucide-react";

interface LeagueOption { key: string; name: string; }

interface AddPlayerDialogProps {
  onAddPlayer: (name: string, initialElo: number, leagueKey: string | null) => void;
  leagues?: LeagueOption[];
}

export default function AddPlayerDialog({ onAddPlayer, leagues = [] }: AddPlayerDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [initialElo, setInitialElo] = useState("1200");
  const [leagueKey, setLeagueKey] = useState<string>("__none__");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onAddPlayer(
        name.trim(),
        parseInt(initialElo) || 1200,
        leagueKey === "__none__" ? null : leagueKey,
      );
      setName("");
      setInitialElo("1200");
      setLeagueKey("__none__");
      setOpen(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-add-player">
          <UserPlus className="w-4 h-4 mr-2" />
          Ajouter un Joueur
        </Button>
      </DialogTrigger>
      <DialogContent data-testid="dialog-add-player">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Ajouter un Nouveau Joueur</DialogTitle>
            <DialogDescription>
              Créez un joueur et affectez-le à sa ligue. Cette affectation peut être modifiée ensuite.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="player-name">Nom du joueur</Label>
              <Input
                id="player-name"
                data-testid="input-player-name"
                placeholder="Entrez le nom du joueur"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="initial-elo">Elo initial</Label>
              <Input
                id="initial-elo"
                data-testid="input-initial-elo"
                type="number"
                placeholder="1200"
                value={initialElo}
                onChange={(e) => setInitialElo(e.target.value)}
                min="0"
                max="3000"
              />
            </div>
            {leagues.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="league-select">Ligue</Label>
                <Select value={leagueKey} onValueChange={setLeagueKey}>
                  <SelectTrigger id="league-select" data-testid="select-player-league">
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
            <Button type="submit" data-testid="button-submit-player">
              Ajouter
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
