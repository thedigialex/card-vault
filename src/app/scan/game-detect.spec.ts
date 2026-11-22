import { GameVote, scoreGames } from './game-detect';

const CARDS: Record<string, string> = {
  mtg: 'Thaumatic Compass\nArtifact\nSearch your library for a basic land card\n249/279 R\nXLN • EN YEONG-HAO HAN\n™ & © 2017 Wizards of the Coast',
  pokemon: 'Pikachu HP 70\nBasic\nGnaw 10\nweakness ×2 resistance retreat\n©2023 Pokémon/Nintendo/Creatures/GAME FREAK\nSVI EN 062/198',
  yugioh: 'Blue-Eyes White Dragon\n[Dragon/Normal]\nATK/3000 DEF/2500\nLOB-EN001\n©1996 KAZUKI TAKAHASHI ©2020 Studio Dice/SHUEISHA, TV TOKYO, KONAMI',
  digimon: 'Agumon\nLv.3\nDP 2000\n[On Play] Reveal the top 3 cards of your deck.\nInherited Effect\n©BANDAI\nBT1-010',
  palworld: 'Jormuntide Ignis – Savage Lava Dragon\nLucky Pal\nKindling\nPower 1700 Strike 4\n<RR> EBP01-001 ©PALWORLD',
};

describe('scoreGames', () => {
  for (const [game, text] of Object.entries(CARDS)) {
    it(`ranks ${game} first for a ${game} card`, () => {
      const [best] = [...scoreGames(text)].sort((a, b) => b[1] - a[1]);
      expect(best[0]).toBe(game);
    });
  }

  it('scores nothing for text with no signs', () => {
    expect(scoreGames('hello there').size).toBe(0);
  });
});

describe('GameVote', () => {
  it('commits once confident and keeps the answer through empty frames', () => {
    const vote = new GameVote();
    expect(vote.add('Legendary')).toBeNull();
    expect(vote.add(CARDS['mtg'])).toBe('mtg');
    expect(vote.add('')).toBe('mtg');
  });

  it('switches when another game clearly takes over', () => {
    const vote = new GameVote();
    vote.add(CARDS['mtg']);
    vote.add(CARDS['pokemon']);
    expect(vote.add(CARDS['pokemon'])).toBe('pokemon');
  });
});
