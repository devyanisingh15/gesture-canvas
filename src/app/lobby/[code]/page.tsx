import { SupabaseGame } from "./SupabaseGame";

export default async function GamePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <SupabaseGame code={code.toUpperCase()} />;
}
