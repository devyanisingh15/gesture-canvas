import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export function BackLink({ href, label = "Back" }: { href: string; label?: string }) {
  return (
    <Link href={href} className="mb-5 inline-flex items-center gap-1.5 text-sm font-bold text-plum-500 hover:text-plum-700">
      <ArrowLeft className="size-4" aria-hidden />
      {label}
    </Link>
  );
}
