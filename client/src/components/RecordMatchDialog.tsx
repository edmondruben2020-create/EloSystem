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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Play } from "lucide-react";

export type MatchResult = "white" | "draw" | "black";

interface Player {
  id: string;
  name: string;
  elo: number;
}

interface RecordMatchDialogProps {
  players: Player[];
  onRecordMatch: (whitePlayerId: string, blackPlayerId: string, result: MatchResult) => void;
}

export default function RecordMatchDialog({ players, onRecordMatch }: RecordMatchDialogProps) {
  const [open, setOpen] = useState(false);
  const [whitePlayer, setWhitePlayer] = useState("");
  const [blackPlayer, setBlackPlayer] = useState("");
  const [result, setResult] = useState<MatchResult | "">("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (whitePlayer && blackPlayer && result && whitePlayer !== blackPlayer) {
      onRecordMatch(whitePlayer, blackPlayer, result as MatchResult);
      setWhitePlayer("");
      setBlackPlayer("");
      setResult("");
      setOpen(false);
    }
  };

  const getPlayerElo = (playerId: string) => {
    const player = players.find(p => p.id === playerId);
    return player ? player.elo : 0;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="default" data-testid="button-record-match">
          <Play className="w-4 h-4 mr-2" />
          Enregistrer un Match
        </Button>
      </DialogTrigger>
      <DialogContent data-testid="dialog-record-match" className="max-w-2xl">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Enregistrer un Match</DialogTitle>
            <DialogDescription>
              Sélectionnez les deux joueurs et le résultat de la partie.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-6">
            <div className="space-y-2">
              <Label htmlFor="white-player">Joueur Blanc</Label>
              <Select value={whitePlayer} onValueChange={setWhitePlayer}>
                <SelectTrigger id="white-player" data-testid="select-white-player">
                  <SelectValue placeholder="Sélectionner..." />
                </SelectTrigger>
                <SelectContent>
                  {players.map((player) => (
                    <SelectItem 
                      key={player.id} 
                      value={player.id}
                      disabled={player.id === blackPlayer}
                    >
                      {player.name} ({player.elo})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {whitePlayer && (
                <p className="text-sm text-muted-foreground">
                  Elo actuel: {getPlayerElo(whitePlayer)}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="black-player">Joueur Noir</Label>
              <Select value={blackPlayer} onValueChange={setBlackPlayer}>
                <SelectTrigger id="black-player" data-testid="select-black-player">
                  <SelectValue placeholder="Sélectionner..." />
                </SelectTrigger>
                <SelectContent>
                  {players.map((player) => (
                    <SelectItem 
                      key={player.id} 
                      value={player.id}
                      disabled={player.id === whitePlayer}
                    >
                      {player.name} ({player.elo})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {blackPlayer && (
                <p className="text-sm text-muted-foreground">
                  Elo actuel: {getPlayerElo(blackPlayer)}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2 pb-4">
            <Label>Résultat</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={result === "white" ? "default" : "outline"}
                className="flex-1"
                onClick={() => setResult("white")}
                data-testid="button-result-white"
              >
                Blancs Gagnent
              </Button>
              <Button
                type="button"
                variant={result === "draw" ? "default" : "outline"}
                className="flex-1"
                onClick={() => setResult("draw")}
                data-testid="button-result-draw"
              >
                Nulle
              </Button>
              <Button
                type="button"
                variant={result === "black" ? "default" : "outline"}
                className="flex-1"
                onClick={() => setResult("black")}
                data-testid="button-result-black"
              >
                Noirs Gagnent
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button 
              type="submit" 
              disabled={!whitePlayer || !blackPlayer || !result || whitePlayer === blackPlayer}
              data-testid="button-submit-match"
            >
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
