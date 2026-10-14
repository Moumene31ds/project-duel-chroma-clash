import { MinigameId } from '../core/types';

export interface TutorialStep {
  title: string;
  body: string;
  tip?: string;
}

// Short per-game onboarding (shown before first play of each minigame)
export class TutorialManager {
  private static readonly STEPS: Record<MinigameId, TutorialStep[]> = {
    cyber_hockey: [
      { title: 'Move', body: 'Drag your mallet to intercept the puck.', tip: 'Stay near your goal when defending.' },
      { title: 'Strike', body: 'Flick fast to charge a Hyper-Shot.' }
    ],
    physics_sumo: [
      { title: 'Push', body: 'Drag to aim, release to lunge.', tip: 'Time lunges when rival is near the edge.' }
    ],
    tactical_tanks: [
      { title: 'Drive', body: 'Left side drag steers your tank.', tip: 'Use walls for ricochet shots.' },
      { title: 'Fire', body: 'Right side tap fires the cannon.' }
    ],
    counter_dash: [
      { title: 'Parry', body: 'Tap left half to parry (110ms window).', tip: 'Double-tap right cancels into feint.' },
      { title: 'Strike', body: 'Tap right half to slash.' }
    ],
    laser_drift: [{ title: 'Drift', body: 'Hold left/right to steer through checkpoints.' }],
    neon_orbit: [{ title: 'Orbit', body: 'Slide along the ring to deflect the disc through gravity.' }],
    memory_matrix: [{ title: 'Memorize', body: 'Watch the flash, then repeat the 3x3 sequence.' }],
    cyber_simon: [{ title: 'Echo', body: 'Repeat the light + sound sequence in order.' }],
    chroma_pairs: [{ title: 'Match', body: 'Flip two cards to match symbols. ⭐ is wild.' }],
    cyber_hoops: [{ title: 'Shoot', body: 'Drag & release to shoot arcs. 3 swishes = ON FIRE.' }],
    laser_pinball: [{ title: 'Flip', body: 'Tap left/right to flip. Hit Fusion Core 3x for multiball.' }],
    chroma_reaction: [{ title: 'React', body: 'Tap the correct color/word under Stroop pressure.' }],
    neon_volley: [{ title: 'Volley', body: 'Move + jump; strike at peak for Super Spike.' }],
    quantum_tug: [{ title: 'Pull', body: 'Tap in the green sweet-spot for 2.4x pull.' }],
    astro_blast: [{ title: 'Dogfight', body: 'Thrust to steer, fire plasma, shield to block.' }],
    cyber_slicer: [
      { title: 'Slice', body: 'Swipe across orbs to slice. ⭐ = 2pts.', tip: 'Never slice 💣 bombs (-1).' },
      { title: 'Combo', body: 'Chain 3+ slices fast for bonus points.' }
    ],
    synthwave_rhythm: [
      { title: 'Beat', body: 'Tap the lane when a note crosses the line.', tip: 'Within 16px = Perfect (2pts).' },
      { title: 'Fever', body: '8 hits in a row activates Fever bonus (+1 per note).' }
    ],
    gravity_runner: [
      { title: 'Flip', body: 'Tap to invert gravity between floor & ceiling.', tip: 'Gold gates show the safe side.' },
      { title: 'Survive', body: 'Each gate cleared = +1. Hits cost -1.' }
    ],
    neon_blade: [
      { title: 'Standoff', body: 'Wait patiently for the SLASH! signal.', tip: 'Tapping before the signal is an instant FOUL!' },
      { title: 'Strike', body: 'When SLASH! flashes, swipe across your zone immediately.' }
    ],
    cyber_bomb: [
      { title: 'Deflect', body: 'Drag your shield to deflect the ticking plasma bomb.', tip: 'Rallies increase bomb speed and danger.' },
      { title: 'Smash', body: 'Swipe rapidly when deflecting to trigger a blazing SUPER SMASH.' }
    ]
  };

  public static stepsFor(id: MinigameId): TutorialStep[] {
    return TutorialManager.STEPS[id] ?? [{ title: 'Play', body: 'Score before your rival to win!' }];
  }

  private static seenKey(id: MinigameId): string {
    return `duel_tutorial_seen_${id}`;
  }

  public static hasSeen(id: MinigameId): boolean {
    try { return localStorage.getItem(TutorialManager.seenKey(id)) === '1'; } catch { return true; }
  }

  public static markSeen(id: MinigameId): void {
    try { localStorage.setItem(TutorialManager.seenKey(id), '1'); } catch { /* noop */ }
  }
}
