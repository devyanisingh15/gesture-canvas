import { SupabaseLobby } from "./SupabaseLobby";

export default async function LobbyPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <SupabaseLobby code={code.toUpperCase()} />;
}
