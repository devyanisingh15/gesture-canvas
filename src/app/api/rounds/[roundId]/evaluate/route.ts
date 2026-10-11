import { placeholderEvaluator } from "@/features/evaluation/placeholderEvaluator";
import type { Json } from "@/lib/supabase/database.types";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseBatch, scoreRound } from "@/server/evaluation/scoreRound";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/rounds/:roundId/evaluate: scores a round that is in EVALUATING.
 *
 * Any player in the game may ask (checked by the database, as that player).
 * The drawings are read and the scores written with the server's secret key,
 * since players can't write scores. Safe to call many times: a round is
 * scored once, and later calls do nothing.
 *
 * 200 { scored: boolean }: scored is false when there was nothing to do.
 * 503: no secret key on this server; the round ends with zeros after the wait.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ roundId: string }> }) {
  const { roundId } = await params;
  if (!UUID.test(roundId)) return Response.json({ error: "Not a round id." }, { status: 400 });

  const admin = getSupabaseAdminClient();
  if (!admin) return Response.json({ error: "Scoring isn't set up on this server." }, { status: 503 });

  // As the signed-in player: are they in this game, and does the round need scoring?
  const player = await createSupabaseServerClient();
  const asked = await player.rpc("request_evaluation", { p_round_id: roundId });
  if (asked.error) return Response.json({ error: "Couldn't check the round." }, { status: asked.error.code === "42501" ? 403 : 502 });
  if (!asked.data) return Response.json({ scored: false });

  const batch = await admin.rpc("evaluation_batch", { p_round_id: roundId });
  if (batch.error) return Response.json({ error: "Couldn't read the drawings." }, { status: 502 });
  const parsed = parseBatch(batch.data);
  if (!parsed) return Response.json({ scored: false });

  const scores = await scoreRound(parsed, placeholderEvaluator);
  const recorded = await admin.rpc("record_scores", { p_round_id: roundId, p_scores: scores as unknown as Json });
  if (recorded.error) return Response.json({ error: "Couldn't store the scores." }, { status: 502 });
  return Response.json({ scored: recorded.data === true });
}
