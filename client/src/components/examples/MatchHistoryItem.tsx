import MatchHistoryItem from '../MatchHistoryItem';

export default function MatchHistoryItemExample() {
  return (
    <MatchHistoryItem 
      id="example-match-1"
      whitePlayer="Magnus Carlsen"
      blackPlayer="Fabiano Caruana"
      result="white"
      whiteEloDelta={8}
      blackEloDelta={-8}
      timestamp={new Date()}
    />
  );
}
