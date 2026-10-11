import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { evaluateRound } from "@/server/evaluation/evaluationService";
import { getEvaluator } from "@/server/evaluation/evaluators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FAILED = { check: "Couldn't check the round.", read: "Couldn't read the drawings.", store: "Couldn't store the scores." };

/**
 * POST /api/rounds/:roundId/evaluate: scores a round that is in EVALUATING.
 *
 * Any player in the game may ask (checked by the database, as that player).
 * Nothing in the request is trusted beyond the round id: the prompt, the
 * drawings and the players come from the database, and the scores are
 * computed here and written with the server's secret key, since players
 * can't write scores. Safe to call many times: a round is scored once, and
 * later calls do nothing.
 *
 * 200 { scored: boolean }: scored is false when there was nothing to do.
 * 503: no secret key on this server; the round ends with zeros after the wait.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ roundId: string }> }) {
  const { roundId } = await params;
  if (!UUID.test(roundId)) return Response.json({ error: "Not a round id." }, { status: 400 });

  const admin = getSupabaseAdminClient();
  if (!admin) return Response.json({ error: "Scoring isn't set up on this server." }, { status: 503 });

  const outcome = await evaluateRound(roundId, { player: await createSupabaseServerClient(), admin, evaluator: getEvaluator() });
  switch (outcome.status) {
    case "scored":
      return Response.json({ scored: true });
    case "nothing-to-do":
      return Response.json({ scored: false });
    case "forbidden":
      return Response.json({ error: FAILED.check }, { status: 403 });
    case "failed":
      return Response.json({ error: FAILED[outcome.step] }, { status: 502 });
  }
}
