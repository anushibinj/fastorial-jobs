import { BriefcaseBusiness, Building2, MapPin, Wifi, WifiLock, type LucideIcon } from "lucide-react";
import { WORK_MODE_LABEL } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { WorkMode } from "@/lib/types";

export const WORK_MODE_ICON: Record<WorkMode, LucideIcon> = {
  REMOTE: Wifi,
  HYBRID: WifiLock,
  ONSITE: BriefcaseBusiness,
};

/** Icon followed by text, for the company / location / work mode lines. */
export function IconText({ icon: Icon, children, className }: { icon: LucideIcon; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <Icon className="size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </span>
  );
}

export function WorkModeLabel({ mode, className }: { mode: WorkMode; className?: string }) {
  return (
    <IconText icon={WORK_MODE_ICON[mode]} className={className}>
      {WORK_MODE_LABEL[mode]}
    </IconText>
  );
}

/** Company, city and work mode as one wrapping row. A city that just repeats the mode is dropped. */
export function JobMeta({
  company,
  city,
  mode,
  companyClassName,
  className,
}: {
  company?: string | null;
  city?: string | null;
  mode?: WorkMode | null;
  companyClassName?: string;
  className?: string;
}) {
  const place = city?.trim() ?? "";
  const showCity = place && !(mode && place.toLowerCase() === WORK_MODE_LABEL[mode].toLowerCase());
  const items = [
    company ? <IconText key="c" icon={Building2} className={companyClassName}>{company}</IconText> : null,
    showCity ? <IconText key="l" icon={MapPin}>{place}</IconText> : null,
    mode ? <WorkModeLabel key="m" mode={mode} /> : null,
  ].filter(Boolean);
  if (items.length === 0) return null;
  return <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1", className)}>{items}</div>;
}
