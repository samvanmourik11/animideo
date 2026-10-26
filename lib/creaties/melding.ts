// Een lange melding (een ffmpeg-opdracht van duizenden tekens) houdt het begin en het eind:
// de echte reden staat bij ffmpeg altijd achteraan.
export function kortMetEinde(reden: string, max = 500): string {
  return reden.length <= max ? reden : `${reden.slice(0, 150)} … ${reden.slice(-(max - 153))}`;
}
