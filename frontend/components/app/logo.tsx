export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" aria-hidden="true" className={className}>
      <rect width="512" height="512" rx="112" className="fill-foreground" />
      <path className="fill-background" d="M168 128h184v64H232v40h88v56h-88v96h-64z" />
    </svg>
  );
}
