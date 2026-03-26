import AddPlayerDialog from '../AddPlayerDialog';

export default function AddPlayerDialogExample() {
  return (
    <AddPlayerDialog 
      onAddPlayer={(name, elo) => console.log('Add player:', name, elo)} 
    />
  );
}
