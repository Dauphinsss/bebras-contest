import * as React from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { DayPicker } from "react-day-picker";

import { cn } from "@/lib/utils";

function Calendar({
  className,
  fixedWeeks = true,
  formatters,
  locale = es,
  showOutsideDays = true,
  weekStartsOn = 0,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      data-slot="calendar"
      fixedWeeks={fixedWeeks}
      locale={locale}
      showOutsideDays={showOutsideDays}
      weekStartsOn={weekStartsOn}
      className={cn("bebras-calendar", className)}
      formatters={{
        ...formatters,
        formatCaption: (month, options, dateLib) => {
          const caption =
            formatters?.formatCaption?.(month, options, dateLib) ??
            format(month, "LLLL yyyy", { locale });

          return caption.charAt(0).toUpperCase() + caption.slice(1);
        },
      }}
      components={{
        Chevron: ({ orientation, className: iconClassName, ...iconProps }) =>
          orientation === "left" ? (
            <ChevronLeftIcon className={cn("rdp-chevron-icon", iconClassName)} {...iconProps} />
          ) : (
            <ChevronRightIcon className={cn("rdp-chevron-icon", iconClassName)} {...iconProps} />
          ),
      }}
      {...props}
    />
  );
}

export { Calendar };
