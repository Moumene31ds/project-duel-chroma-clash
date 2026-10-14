import { TournamentState, TournamentMatch, MinigameId } from '../core/types';

export class TournamentManager {
  private state: TournamentState | null = null;
  private readonly availableMinigames: MinigameId[] = [
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

  public createBestOfSeries(player1: string = 'Player 1', player2: string = 'Player 2', bestOf: number = 3): TournamentState {
    const matches: TournamentMatch[] = [];
    const targetWins = Math.ceil(bestOf / 2);

    for (let i = 0; i < bestOf; i++) {
      matches.push({
        id: i + 1,
        round: i + 1,
        playerA: player1,
        playerB: player2,
        scoreA: 0,
        scoreB: 0,
        winner: null,
        minigame: this.availableMinigames[i % this.availableMinigames.length],
        completed: false
      });
    }

    this.state = {
      title: `Championship: Best of ${bestOf}`,
      mode: 'best_of_series',
      players: [player1, player2],
      matches,
      currentMatchIndex: 0,
      champion: null,
      seriesTarget: targetWins
    };

    return this.state;
  }

  public createSingleElimination(players: string[]): TournamentState {
    // Bracket size is 4 or 8: pad short lists, truncate long ones (old code
    // silently dropped every player past index 3).
    const list = [...players].slice(0, 8);
    while (list.length < 4) {
      list.push(`Challenger ${list.length + 1}`);
    }
    const size = list.length > 4 ? 8 : 4;
    while (list.length < size) {
      list.push(`Challenger ${list.length + 1}`);
    }

    const matches: TournamentMatch[] = [];
    let matchId = 1;
    const mkMatch = (round: number, a: string, b: string): TournamentMatch => ({
      id: matchId++,
      round,
      playerA: a,
      playerB: b,
      scoreA: 0,
      scoreB: 0,
      winner: null,
      minigame: this.getRandomMinigame(),
      completed: false
    });

    if (size === 4) {
      // Round 1 (Semi-Finals for 4 players)
      matches.push(mkMatch(1, list[0], list[1]));
      matches.push(mkMatch(1, list[2], list[3]));
      // Finals placeholder
      matches.push(mkMatch(2, 'Winner SF1', 'Winner SF2'));
    } else {
      // Round 1 (Quarter-Finals)
      for (let q = 0; q < 4; q++) {
        matches.push(mkMatch(1, list[q * 2], list[q * 2 + 1]));
      }
      // Round 2 (Semi-Finals placeholders)
      matches.push(mkMatch(2, 'Winner QF1', 'Winner QF2'));
      matches.push(mkMatch(2, 'Winner QF3', 'Winner QF4'));
      // Round 3 (Grand Final placeholder)
      matches.push(mkMatch(3, 'Winner SF1', 'Winner SF2'));
    }

    this.state = {
      title: size === 8 ? 'Grand Tournament: 8-Player Bracket' : 'Grand Tournament: 4-Player Bracket',
      mode: 'single_elim',
      players: list,
      matches,
      currentMatchIndex: 0,
      champion: null,
      seriesTarget: 1
    };

    return this.state;
  }

  public getCurrentMatch(): TournamentMatch | null {
    if (!this.state || this.state.currentMatchIndex >= this.state.matches.length) return null;
    return this.state.matches[this.state.currentMatchIndex];
  }

  public recordMatchScore(winner: 1 | 2): { match: TournamentMatch; tournamentOver: boolean; champion: string | null } {
    if (!this.state) throw new Error('No active tournament');
    const current = this.state.matches[this.state.currentMatchIndex];
    if (!current) throw new Error('No active match');

    const winnerName = winner === 1 ? current.playerA : current.playerB;
    current.winner = winnerName;
    current.completed = true;
    if (winner === 1) current.scoreA++;
    else current.scoreB++;

    // Check Best of Series win condition
    if (this.state.mode === 'best_of_series') {
      let p1Wins = 0;
      let p2Wins = 0;
      for (const m of this.state.matches) {
        if (m.winner === this.state.players[0]) p1Wins++;
        if (m.winner === this.state.players[1]) p2Wins++;
      }

      if (p1Wins >= this.state.seriesTarget) {
        this.state.champion = this.state.players[0];
        return { match: current, tournamentOver: true, champion: this.state.champion };
      }
      if (p2Wins >= this.state.seriesTarget) {
        this.state.champion = this.state.players[1];
        return { match: current, tournamentOver: true, champion: this.state.champion };
      }
    }

    // Single Elimination progression (generic across 4- and 8-player
    // brackets: winners flow into the next round's placeholder slots)
    if (this.state.mode === 'single_elim') {
      const roundMatches = this.state.matches.filter(m => m.round === current.round);
      const pos = roundMatches.indexOf(current);
      const nextRound = this.state.matches.filter(m => m.round === current.round + 1);
      if (nextRound.length === 0) {
        // Grand Final Winner
        this.state.champion = winnerName;
        return { match: current, tournamentOver: true, champion: winnerName };
      }
      const target = nextRound[Math.floor(pos / 2)];
      if (target) {
        if (pos % 2 === 0) target.playerA = winnerName;
        else target.playerB = winnerName;
      }
    }

    this.state.currentMatchIndex++;
    const isOver = this.state.currentMatchIndex >= this.state.matches.length;
    return {
      match: current,
      tournamentOver: isOver,
      champion: this.state.champion
    };
  }

  public getState(): TournamentState | null {
    return this.state;
  }

  private getRandomMinigame(): MinigameId {
    const idx = Math.floor(Math.random() * this.availableMinigames.length);
    return this.availableMinigames[idx];
  }
}
