import LeaderboardTable from '../LeaderboardTable';

export default function LeaderboardTableExample() {
  const mockPlayers = [
    { id: '1', name: 'Magnus Carlsen', elo: 2850, gamesPlayed: 45, kFactor: 10 },
    { id: '2', name: 'Fabiano Caruana', elo: 2820, gamesPlayed: 38, kFactor: 10 },
    { id: '3', name: 'Ding Liren', elo: 2780, gamesPlayed: 42, kFactor: 10 },
    { id: '4', name: 'Ian Nepomniachtchi', elo: 2775, gamesPlayed: 35, kFactor: 10 },
    { id: '5', name: 'Alireza Firouzja', elo: 2760, gamesPlayed: 28, kFactor: 40 },
  ];

  return <LeaderboardTable players={mockPlayers} />;
}
