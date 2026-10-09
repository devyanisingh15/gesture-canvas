import { LiveGame } from "./LiveGame";

export default async function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <LiveGame code={code.toUpperCase()} />;
}
