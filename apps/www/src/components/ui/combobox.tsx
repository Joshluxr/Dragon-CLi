"use client";

import * as React from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export function Combobox<
  T extends { value: string; label: string; item?: React.ReactNode },
>({
  icon,
  className,
  items,
  value,
  disabled,
  setValue,
  placeholder,
  emptyText,
  disableSearch,
  searchPlaceholder,
  contentsClassName,
}: {
  icon?: React.ReactNode;
  className?: string;
  items: T[];
  value: string | null;
  setValue: (value: string) => void;
  disabled: boolean;
  placeholder: string;
  searchPlaceholder: string;
  emptyText: string;
  disableSearch?: boolean;
  contentsClassName?: string;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "min-w-[100px] max-w-[250px] justify-between",
            className,
          )}
        >
          <div className="flex items-center gap-2 min-w-0">
            {icon}
            <span className="truncate">
              {value
                ? items.find((item) => item.value === value)?.label
                : placeholder}
            </span>
          </div>
          <ChevronDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn("min-w-[100px] p-0", contentsClassName)}
        align="start"
      >
        <Command>
          {!disableSearch && <CommandInput placeholder={searchPlaceholder} />}
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {items.map((item) => {
                return (
                  <CommandItem
                    key={item.value}
                    value={item.value}
                    className="flex items-start"
                    onSelect={() => {
                      setValue(item.value === value ? "" : item.value);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "h-4 w-4 mt-0.5",
                        value === item.value ? "opacity-100" : "opacity-0",
                      )}
                    />
                    {item.item || item.label}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
