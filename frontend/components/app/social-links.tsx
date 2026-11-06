import type { SVGProps } from "react";

const LINKEDIN_URL = "https://www.linkedin.com/company/fastorial/";
const WHATSAPP_URL = "https://whatsapp.com/channel/0029VbEVKeKGzzKXnIWbWe2v";

function LinkedInIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.34V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45zM22.23 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.46c.98 0 1.77-.77 1.77-1.73V1.73C24 .77 23.21 0 22.23 0z" />
    </svg>
  );
}

function WhatsAppIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.14-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.08 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35zM12.05 21.78h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26c0-5.45 4.44-9.88 9.89-9.88 2.64 0 5.12 1.03 6.99 2.9a9.82 9.82 0 0 1 2.89 6.99c0 5.45-4.44 9.88-9.88 9.88zM20.52 3.45A11.8 11.8 0 0 0 12.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.14 1.59 5.95L.06 24l6.3-1.65a11.88 11.88 0 0 0 5.68 1.45h.01c6.55 0 11.89-5.34 11.89-11.89 0-3.18-1.24-6.16-3.48-8.4z" />
    </svg>
  );
}

const LINKS = [
  { id: "header_whatsapp_link", label: "Follow on WhatsApp", href: WHATSAPP_URL, Icon: WhatsAppIcon },
  { id: "header_linkedin_link", label: "Follow on LinkedIn", href: LINKEDIN_URL, Icon: LinkedInIcon },
];

/** Flat row of social icon links. Clicks are reported by the global ClickTracker via `data-track`. */
export function SocialLinks() {
  return (
    <nav aria-label="Social links" className="ml-auto flex items-center">
      {LINKS.map(({ id, label, href, Icon }) => (
        <div key={id} className="group relative">
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={label}
            data-track={id}
            className="text-muted-foreground hover:text-foreground focus-visible:text-foreground flex size-11 items-center justify-center rounded-md transition-colors"
          >
            <Icon className="size-5" />
          </a>
          <span
            role="tooltip"
            className="bg-popover text-popover-foreground ring-foreground/10 pointer-events-none absolute right-0 top-full z-50 mt-1 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs opacity-0 shadow-md ring-1 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
          >
            {label}
          </span>
        </div>
      ))}
    </nav>
  );
}
