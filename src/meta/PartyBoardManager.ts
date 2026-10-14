import { PlayerIndex, BoardTile, PartyBoardState, MinigameId } from '../core/types';
import { AudioHaptics } from '../core/AudioHaptics';

export class PartyBoardManager {
  private state: PartyBoardState;
  private audio: AudioHaptics;
  public tiles: BoardTile[] = [];

  constructor(audio: AudioHaptics) {
    this.audio = audio;
    this.initBoardTiles();
    this.state = this.getDefaultState();
  }

  private initBoardTiles() {
    const rawTiles: { type: BoardTile['type']; label: string; icon: string }[] = [
      { type: 'bonus', label: 'CYBER START', icon: '🚀' },
      { type: 'minigame_duel', label: 'DUEL ARENA', icon: '⚔️' },
      { type: 'bonus', label: 'SOLAR VAULT', icon: '🪙' },
      { type: 'hazard', label: 'NEON TRAP', icon: '⚠️' },
      { type: 'star_station', label: 'STAR NEXUS', icon: '⭐' },
      { type: 'minigame_duel', label: 'DUEL ARENA', icon: '⚔️' },
      { type: 'warp_gate', label: 'QUANTUM WARP', icon: '🌀' },
      { type: 'bonus', label: 'CYBER CACHE', icon: '💎' },
      { type: 'minigame_duel', label: 'DUEL ARENA', icon: '⚔️' },
      { type: 'hazard', label: 'GLITCH SPIKE', icon: '⚡' },
      { type: 'star_station', label: 'STAR NEXUS', icon: '⭐' },
      { type: 'minigame_duel', label: 'DUEL ARENA', icon: '⚔️' },
      { type: 'bonus', label: 'MATRIX OVERDRIVE', icon: '🔋' },
      { type: 'warp_gate', label: 'QUANTUM WARP', icon: '🌀' },
      { type: 'minigame_duel', label: 'DUEL ARENA', icon: '⚔️' },
      { type: 'hazard', label: 'OVERLOAD TRAP', icon: '💥' }
    ];

    // Compute loop track coordinates on standard 420x840 mobile canvas
    // Outer rounded loop path: 5 tiles across top, 4 down right, 5 across bottom, 4 up left
    this.tiles = rawTiles.map((t, idx) => {
      let x = 0;
      let y = 0;
      if (idx >= 0 && idx <= 4) {
        // Top edge (left to right)
        x = 50 + idx * 80;
        y = 120;
      } else if (idx >= 5 && idx <= 8) {
        // Right edge (top to bottom)
        x = 370;
        y = 120 + (idx - 4) * 110;
      } else if (idx >= 9 && idx <= 12) {
        // Bottom edge (right to left)
        x = 370 - (idx - 8) * 80;
        y = 560;
      } else {
        // Left edge (bottom to top)
        x = 50;
        y = 560 - (idx - 12) * 110;
      }

      return {
        id: idx,
        type: t.type,
        label: t.label,
        icon: t.icon,
        x,
        y
      };
    });
  }

  private getDefaultState(): PartyBoardState {
    return {
      currentRound: 1,
      maxRounds: 8,
      activePlayer: 1,
      players: {
        1: {
          index: 1,
          name: 'PLAYER 1',
          tileIndex: 0,
          coins: 20,
          stars: 0,
          color: '#FF0055'
        },
        2: {
          index: 2,
          name: 'PLAYER 2',
          tileIndex: 0,
          coins: 20,
          stars: 0,
          color: '#0084FF'
        }
      },
      isRolling: false,
      diceValue: 1,
      starStationTileIndex: 4,
      lastEventMessage: 'Welcome to Party Board Game! Roll the Cyber Dice.',
      phase: 'roll',
      winner: null
    };
  }

  public startNewGame(p1Name: string = 'PLAYER 1', p2Name: string = 'PLAYER 2'): PartyBoardState {
    this.state = this.getDefaultState();
    this.state.players[1].name = p1Name;
    this.state.players[2].name = p2Name;
    return this.state;
  }

  public getState(): PartyBoardState {
    return this.state;
  }

  public rollDice(): number {
    this.audio.playDiceRoll();
    const roll = Math.floor(Math.random() * 6) + 1;
    this.state.diceValue = roll;
    this.state.phase = 'moving';
    return roll;
  }

  public advanceActivePlayer(steps: number): { landedTile: BoardTile; passedStarStation: boolean } {
    const p = this.state.players[this.state.activePlayer];
    const initialTile = p.tileIndex;
    p.tileIndex = (p.tileIndex + steps) % this.tiles.length;

    // Check if player PASSED a Star Station. Only intermediate tiles count:
    // the landing tile is handled separately by executeTileLanding, otherwise
    // landing exactly on a star charges 60 coins for 2 stars.
    let passedStar = false;
    for (let s = 1; s < steps; s++) {
      const passedIdx = (initialTile + s) % this.tiles.length;
      if (this.tiles[passedIdx].type === 'star_station') {
        passedStar = true;
        break;
      }
    }

    if (passedStar && p.coins >= 30) {
      p.coins -= 30;
      p.stars += 1;
      this.audio.playTrophyRankUp();
      this.state.lastEventMessage = `${p.name} acquired a CYBER STAR ⭐ for 30 coins!`;
    }

    const landedTile = this.tiles[p.tileIndex];
    this.executeTileLanding(landedTile);
    return { landedTile, passedStarStation: passedStar };
  }

  private executeTileLanding(tile: BoardTile) {
    const p = this.state.players[this.state.activePlayer];

    switch (tile.type) {
      case 'bonus': {
        const bonus = 15;
        p.coins += bonus;
        this.audio.playHoopSwish();
        this.state.lastEventMessage = `${p.name} landed on ${tile.label} (+${bonus} Coins)!`;
        this.state.phase = 'tile_event';
        break;
      }
      case 'hazard': {
        const penalty = Math.min(p.coins, 10);
        p.coins -= penalty;
        this.audio.playPinballBumper();
        this.state.lastEventMessage = `${p.name} tripped a ${tile.label} (-${penalty} Coins)!`;
        this.state.phase = 'tile_event';
        break;
      }
      case 'warp_gate': {
        p.tileIndex = (p.tileIndex + 3) % this.tiles.length;
        const dest = this.tiles[p.tileIndex];
        this.audio.playDiceRoll();
        // Resolve the destination tile once (no warp chaining): a star
        // destination can still be purchased, other tiles grant a warp bonus.
        if (dest.type === 'star_station' && p.coins >= 30) {
          p.coins -= 30;
          p.stars += 1;
          this.state.lastEventMessage = `${p.name} warped onto STAR NEXUS ⭐! Star acquired!`;
        } else if (dest.type === 'bonus') {
          p.coins += 15;
          this.state.lastEventMessage = `${p.name} warped onto ${dest.label} (+15 Coins)!`;
        } else if (dest.type === 'hazard') {
          const penalty = Math.min(p.coins, 10);
          p.coins -= penalty;
          this.state.lastEventMessage = `${p.name} warped into ${dest.label} (-${penalty} Coins)!`;
        } else {
          p.coins += 5;
          this.state.lastEventMessage = `${p.name} warped forward 3 tiles! (+5 Coins)`;
        }
        this.state.phase = 'tile_event';
        break;
      }
      case 'star_station': {
        if (p.coins >= 30) {
          p.coins -= 30;
          p.stars += 1;
          this.audio.playTrophyRankUp();
          this.state.lastEventMessage = `${p.name} landed directly on STAR NEXUS ⭐! Star acquired!`;
        } else {
          this.state.lastEventMessage = `${p.name} visited STAR NEXUS (Needs 30 coins for a Star).`;
        }
        this.state.phase = 'tile_event';
        break;
      }
      case 'minigame_duel': {
        this.state.lastEventMessage = `⚔️ MINIGAME DUEL TRIGGERED! Winner steals 15 coins!`;
        this.state.phase = 'duel_pending';
        break;
      }
    }

    // Check for 3-star early victory
    if (p.stars >= 3) {
      this.state.winner = p.index;
      this.state.phase = 'game_over';
      this.state.lastEventMessage = `🏆 ${p.name} REACHED 3 STARS AND WON THE CYBER CHAMPIONSHIP!`;
    }
  }

  public resolveMinigameDuel(winner: PlayerIndex) {
    const winnerPlayer = this.state.players[winner];
    const loserPlayer = this.state.players[winner === 1 ? 2 : 1];

    const stolen = Math.min(loserPlayer.coins, 15);
    loserPlayer.coins -= stolen;
    winnerPlayer.coins += stolen;

    this.state.lastEventMessage = `⚔️ ${winnerPlayer.name} won the Duel and claimed ${stolen} coins!`;
    this.endTurn();
  }

  public endTurn() {
    if (this.state.winner) return;

    if (this.state.activePlayer === 1) {
      this.state.activePlayer = 2;
    } else {
      this.state.activePlayer = 1;
      this.state.currentRound++;

      if (this.state.currentRound > this.state.maxRounds) {
        // Evaluate winner by stars then coins
        const p1 = this.state.players[1];
        const p2 = this.state.players[2];

        if (p1.stars > p2.stars) {
          this.state.winner = 1;
        } else if (p2.stars > p1.stars) {
          this.state.winner = 2;
        } else if (p1.coins >= p2.coins) {
          this.state.winner = 1;
        } else {
          this.state.winner = 2;
        }

        this.state.phase = 'game_over';
        this.state.lastEventMessage = `🎉 Game Over! ${this.state.players[this.state.winner].name} wins the Party Crown!`;
        return;
      }
    }

    this.state.phase = 'roll';
  }

  public getRandomDuelMinigame(): MinigameId {
    const list: MinigameId[] = [
      'cyber_hockey',
      'physics_sumo',
      'tactical_tanks',
      'counter_dash',
      'laser_drift',
      'neon_orbit',
      'memory_matrix',
      'cyber_simon',
      'chroma_pairs',
      'cyber_hoops',
      'laser_pinball',
      'chroma_reaction',
      'neon_volley',
      'quantum_tug',
      'astro_blast',
      'cyber_slicer',
      'synthwave_rhythm',
      'gravity_runner',
      'neon_blade',
      'cyber_bomb'
    ];
    return list[Math.floor(Math.random() * list.length)];
  }
}
