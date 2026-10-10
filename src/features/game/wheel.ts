import { PROMPTS } from "./prompts";
import type { PromptId } from "./types";

/**
 * Wheel geometry. The wheel is visual only: the server picks the prompt, and
 * these turn that prompt into the rotation that lands on it.
 */

/** How long a full spin takes. Every client lands at the server's spin start + SPIN_MS. */
export const SPIN_MS = 4200;

const slice = () => 360 / PROMPTS.length;

/** Wheel rotation (deg) that puts a prompt's segment under the pointer, after a few full turns. */
export function landingRotation(targetId: PromptId): number {
  const index = Math.max(0, PROMPTS.findIndex((p) => p.id === targetId));
  return 360 * 6 - (index * slice() + slice() / 2);
}

/** The prompt under the pointer for a wheel rotation (deg). Inverse of landingRotation. */
export function promptAtRotation(rotation: number): PromptId {
  const atPointer = (((-rotation % 360) + 360) % 360) / slice();
  return PROMPTS[Math.floor(atPointer) % PROMPTS.length]!.id;
}

/** How far into the spin a client is, given when the server started it and the server's clock now. */
export function spinElapsedMs(spinStartedAt: number, serverNow: number): number {
  return Math.max(0, serverNow - spinStartedAt);
}
