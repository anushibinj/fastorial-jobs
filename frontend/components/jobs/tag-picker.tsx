"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type TagOption = { slug: string; name: string; count?: number };

type Props = {
  options: TagOption[];
  value: string[];
  onChange: (slugs: string[]) => void;
  placeholder?: string;
  id?: string;
};

/** Multi select for tech stack: Popover + Command. */
export function TagPicker({ options, value, onChange, placeholder = "Any", id }: Props) {
  const [open, setOpen] = useState(false);
  const byslug = new Map(options.map((o) => [o.slug, o]));
  const first = value[0] ? (byslug.get(value[0])?.name ?? value[0]) : null;
  const label = first ? (value.length > 1 ? `${first} +${value.length - 1}` : first) : placeholder;

  function toggle(slug: string) {
    onChange(value.includes(slug) ? value.filter((s) => s !== slug) : [...value, slug]);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("min-h-11 w-full justify-between font-normal", !first && "text-muted-foreground")}
        >
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search" />
          <CommandList>
            <CommandEmpty>No match</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem key={o.slug} value={o.name} onSelect={() => toggle(o.slug)} className="min-h-11">
                  <Check className={cn("size-4", value.includes(o.slug) ? "opacity-100" : "opacity-0")} />
                  <span className="flex-1">{o.name}</span>
                  {o.count !== undefined ? <span className="text-muted-foreground text-xs">{o.count}</span> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
