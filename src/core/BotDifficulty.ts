import { AIDifficulty } from './types';

// Centralized bot difficulty profiles: every bot in all 18 games derives its
// behavior from these tiers, so the menu selection (easy/medium/hard) maps to
// a consistent, clearly separated skill gap everywhere.
export interface BotProfile {
  // seconds the bot waits before reacting to a new stimulus
  reactionMin: number;
  reactionMax: number;
  // chance (0..1) to deliberately flub an action it could have made
  errorRate: number;
  // movement/tracking speed multiplier
  speedMul: number;
  // prediction horizon in seconds (0 = purely reactive)
  predictSec: number;
  // aim noise amplitude in pixels
  jitterPx: number;
  // attack frequency scale (1 = full aggression)
  aggression: number;
}

export const BOT_PROFILES: Record<AIDifficulty, BotProfile> = {
  easy: {
    reactionMin: 0.55,
    reactionMax: 0.95,
    errorRate: 0.35,
    speedMul: 0.55,
    predictSec: 0.05,
    jitterPx: 38,
    aggression: 0.4
  },
  medium: {
    reactionMin: 0.28,
    reactionMax: 0.5,
    errorRate: 0.12,
    speedMul: 0.8,
    predictSec: 0.22,
    jitterPx: 12,
    aggression: 0.7
  },
  hard: {
    reactionMin: 0.08,
    reactionMax: 0.2,
    errorRate: 0.02,
    speedMul: 1.15,
    predictSec: 0.42,
    jitterPx: 0,
    aggression: 1.0
  }
};

export function botProfile(d: AIDifficulty): BotProfile {
  return BOT_PROFILES[d] ?? BOT_PROFILES.medium;
}

// Roll once per attempted action: true means the bot flubs it on purpose.
export function botMakesMistake(d: AIDifficulty): boolean {
  return Math.random() < botProfile(d).errorRate;
}

// Fresh reaction delay for the given tier.
export function botReactionDelay(d: AIDifficulty): number {
  const p = botProfile(d);
  return p.reactionMin + Math.random() * (p.reactionMax - p.reactionMin);
}
