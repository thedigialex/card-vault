import { GameDefinition } from '../data/models';
import { digimon } from './digimon';
import { magic } from './magic';
import { palworld } from './palworld';

export const GAMES: GameDefinition[] = [digimon, palworld, magic];

export function gameById(id: string): GameDefinition | undefined {
  return GAMES.find(game => game.id === id);
}
