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
