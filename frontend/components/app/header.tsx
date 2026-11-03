import Link from "next/link";
import { LogoMark } from "@/components/app/logo";
import { SITE_NAME } from "@/lib/site";

export function Header() {
  return (
    <header className="bg-background/95 pt-safe sticky top-0 z-40 border-b backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="pl-safe pr-safe">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center px-4">
          <Link href="/" className="-ml-2 flex min-h-11 items-center gap-2 rounded-md px-2 font-semibold tracking-tight">
            <LogoMark className="size-6" />
            <span>{SITE_NAME}</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
