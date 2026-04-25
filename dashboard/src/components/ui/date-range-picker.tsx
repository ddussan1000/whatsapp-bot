import * as React from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Calendar as CalendarIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface DateRangePickerProps {
  value: DateRange | undefined;
  onChange: (range: DateRange | undefined) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  toDate?: Date;
  numberOfMonths?: 1 | 2;
}

export function DateRangePicker({
  value,
  onChange,
  placeholder = "Seleccionar rango",
  className,
  disabled,
  toDate,
  numberOfMonths = 2,
}: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [internalRange, setInternalRange] = React.useState<
    DateRange | undefined
  >(value);

  React.useEffect(() => {
    if (!open) setInternalRange(value);
  }, [value, open]);

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) setInternalRange(value);
    setOpen(isOpen);
  };

  const handleSelect = (range: DateRange | undefined) => {
    setInternalRange(range);
    if (range?.from && range?.to) {
      onChange(range);
      setOpen(false);
    }
  };

  const label = React.useMemo(() => {
    if (!value?.from) return null;
    if (!value.to) return format(value.from, "d MMM yyyy", { locale: es });
    return `${format(value.from, "d MMM", { locale: es })} – ${format(value.to, "d MMM yyyy", { locale: es })}`;
  }, [value]);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn(
            "h-9 justify-start gap-2 text-left text-sm font-normal",
            !label && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="size-4 shrink-0" />
          {label ?? placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          resetOnSelect
          selected={internalRange}
          onSelect={handleSelect}
          numberOfMonths={numberOfMonths}
          toDate={toDate}
          locale={es}
        />
      </PopoverContent>
    </Popover>
  );
}

interface DatePickerProps {
  value: Date | undefined;
  onChange: (date: Date | undefined) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  toDate?: Date;
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Seleccionar fecha",
  className,
  disabled,
  toDate,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn(
            "h-9 justify-start gap-2 text-left text-sm font-normal",
            !value && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="size-4 shrink-0" />
          {value ? format(value, "d MMM yyyy", { locale: es }) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value}
          onSelect={(date) => {
            onChange(date);
            setOpen(false);
          }}
          toDate={toDate}
          locale={es}
        />
      </PopoverContent>
    </Popover>
  );
}
