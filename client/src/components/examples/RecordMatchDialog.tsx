import RecordMatchDialog from '../RecordMatchDialog';

export default function RecordMatchDialogExample() {
  const mockPlayers = [
    { id: '1', name: 'Magnus Carlsen', elo: 2850 },
    { id: '2', name: 'Fabiano Caruana', elo: 2820 },
    { id: '3', name: 'Ding Liren', elo: 2780 },
  ];

  return (
    <RecordMatchDialog 
      players={mockPlayers}
      onRecordMatch={(white, black, result) => 
        console.log('Record match:', white, 'vs', black, ':', result)
      } 
    />
  );
}
