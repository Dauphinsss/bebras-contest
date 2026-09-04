"use client";

import { useState } from "react";
import { MenuIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { getUser } from "@/lib/auth";
import { canAccessSiteNav, SITE_NAV_ITEMS } from "@/lib/site-navigation";

type MobileNavigationProps = {
  pathname: string;
};

export function MobileNavigation({ pathname }: MobileNavigationProps) {
  const [open, setOpen] = useState(false);
  const [user] = useState(getUser);
  const links = SITE_NAV_ITEMS.filter((item) =>
    canAccessSiteNav(item.role, user?.role, user?.status),
  );

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="contents lg:hidden"
    >
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          size="icon-lg"
          variant="ghost"
          aria-label={open ? "Cerrar menú" : "Abrir menú"}
        >
          {open ? <XIcon /> : <MenuIcon />}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="order-last w-full basis-full pt-3">
        <nav
          aria-label="Navegación principal"
          className="flex flex-col gap-2 border-t pt-3"
        >
          {links.map((link) => {
            const active =
              pathname === link.href || pathname.startsWith(`${link.href}/`);

            return (
              <Button
                key={link.href}
                asChild
                variant={active ? "default" : "ghost"}
                className="w-full justify-start"
              >
                <a
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setOpen(false)}
                >
                  {link.label}
                </a>
              </Button>
            );
          })}
        </nav>
      </CollapsibleContent>
    </Collapsible>
  );
}
