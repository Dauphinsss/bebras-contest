"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarIcon, Clock8Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toDatetimeLocalValue } from "@/lib/contest-schema";
import { cn } from "@/lib/utils";

export function parseDateTimeLocal(value: string) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function toTimeValue(value: string) {
  const date = parseDateTimeLocal(value);

  if (!date) {
    return "";
  }

  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function withDate(currentValue: string, nextDate: Date, fallbackHour: number) {
  const currentDate = parseDateTimeLocal(currentValue);
  const nextValue = new Date(nextDate);

  if (currentDate) {
    nextValue.setHours(currentDate.getHours(), currentDate.getMinutes(), 0, 0);
  } else {
    nextValue.setHours(fallbackHour, 0, 0, 0);
  }

  return toDatetimeLocalValue(nextValue.toISOString());
}

function withTime(currentValue: string, nextTime: string) {
  const currentDate = parseDateTimeLocal(currentValue) ?? new Date();
  const [hours, minutes] = nextTime.split(":").map((part) => Number(part));

  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return currentValue;
  }

  const nextValue = new Date(currentDate);
  nextValue.setHours(hours, minutes, 0, 0);
  return toDatetimeLocalValue(nextValue.toISOString());
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function DateTimeField({
  id,
  value,
  onChange,
  label,
  minDate = null,
  maxDate = null,
  fallbackHour = 8,
  disabled = false,
  invalid = false,
}: {
  id?: string;
  value: string;
  onChange: (nextValue: string) => void;
  label: string;
  minDate?: Date | null;
  maxDate?: Date | null;
  fallbackHour?: number;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const date = parseDateTimeLocal(value);
  const dateLabel = date
    ? format(date, "d 'de' MMMM 'de' yyyy", { locale: es })
    : "Elige un día";
  const [timeDraft, setTimeDraft] = useState(toTimeValue(value));

  useEffect(() => {
    setTimeDraft(toTimeValue(value));
  }, [value]);

  const timeMin =
    date && minDate && isSameDay(date, minDate)
      ? toTimeValue(minDate.toISOString())
      : undefined;
  const timeMax =
    date && maxDate && isSameDay(date, maxDate)
      ? toTimeValue(maxDate.toISOString())
      : undefined;

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            aria-invalid={invalid}
            aria-label={`${label}, día`}
            className={cn(
              "w-full justify-start text-left font-normal sm:flex-1",
              !date && "text-muted-foreground",
            )}
          >
            <CalendarIcon data-icon="inline-start" />
            {dateLabel}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          data-calendar-popover
          className="w-auto rounded-sm p-0"
          align="start"
        >
          <Calendar
            initialFocus
            mode="single"
            selected={date ?? undefined}
            defaultMonth={date ?? minDate ?? undefined}
            disabled={[
              ...(minDate ? [{ before: minDate }] : []),
              ...(maxDate ? [{ after: maxDate }] : []),
            ]}
            onSelect={(nextDate) => {
              if (nextDate) {
                onChange(withDate(value, nextDate, fallbackHour));
              }
            }}
          />
        </PopoverContent>
      </Popover>
      <div className="relative sm:w-36">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center justify-center pl-3 text-muted-foreground">
          <Clock8Icon className="size-4" />
        </div>
        <Input
          aria-label={`${label}, hora`}
          aria-invalid={invalid}
          className="peer appearance-none bg-background pl-9 [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
          type="time"
          disabled={disabled || !date}
          min={timeMin}
          max={timeMax}
          value={timeDraft}
          onChange={(event) => {
            const nextValue = event.target.value;
            setTimeDraft(nextValue);

            if (nextValue) {
              onChange(withTime(value, nextValue));
            }
          }}
        />
      </div>
    </div>
  );
}
