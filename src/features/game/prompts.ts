import type { DrawingPrompt, PromptId } from "./types";

/** Controlled MVP prompt list. Evaluation templates are keyed by these ids. */
export const PROMPTS: readonly DrawingPrompt[] = [
  { id: "house", label: "House", emoji: "🏠", hint: "Walls, a roof and a door" },
  { id: "tree", label: "Tree", emoji: "🌳", hint: "A trunk and a leafy crown" },
  { id: "sun", label: "Sun", emoji: "☀️", hint: "A circle with rays" },
  { id: "car", label: "Car", emoji: "🚗", hint: "A body and two wheels" },
  { id: "fish", label: "Fish", emoji: "🐟", hint: "An oval body and a tail" },
  { id: "cat", label: "Cat", emoji: "🐱", hint: "Pointy ears and whiskers" },
  { id: "rocket", label: "Rocket", emoji: "🚀", hint: "A nose cone, a window and fins" },
  { id: "flower", label: "Flower", emoji: "🌸", hint: "Petals around a center and a stem" },
  { id: "guitar", label: "Guitar", emoji: "🎸", hint: "A rounded body and a long neck" },
  { id: "airplane", label: "Airplane", emoji: "✈️", hint: "A body, wings and a tail" },
];

export function getPrompt(id: PromptId): DrawingPrompt {
  const prompt = PROMPTS.find((p) => p.id === id);
  if (!prompt) throw new Error(`Unknown prompt: ${id}`);
  return prompt;
}
