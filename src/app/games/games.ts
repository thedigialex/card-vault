import { GameDefinition } from '../data/models';
import { digimon } from './digimon';
import { magic } from './magic';
import { palworld } from './palworld';
import { pokemon } from './pokemon';
import { yugioh } from './yugioh';

export const GAMES: GameDefinition[] = [digimon, pokemon, yugioh, magic, palworld];

export function gameById(id: string): GameDefinition | undefined {
  return GAMES.find(game => game.id === id);
}

/** The game's name (or short name), falling back to the id for a game this version doesn't know. */
export function gameName(id: string, short = false): string {
  const game = gameById(id);
  return (short ? game?.shortName : undefined) ?? game?.name ?? id;
}
