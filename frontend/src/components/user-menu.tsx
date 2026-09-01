"use client";

import { useState } from "react";
import { ChevronDownIcon, LogOutIcon } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { clearToken, getUser, type AuthUser } from "@/lib/auth";

function getInitials(user: AuthUser) {
  const source = (user.name && user.name.trim()) || user.email;
  const parts = source.trim().split(/\s+/).filter(Boolean);

  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  return source.slice(0, 2).toUpperCase();
}

function firstName(user: AuthUser) {
  const source = (user.name && user.name.trim()) || user.email;
  return source.split(/\s+/)[0] ?? source;
}

export function UserMenu() {
  const [user] = useState<AuthUser | null>(() => getUser());

  if (!user) {
    return (
      <a
        href="/login"
        className="rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
      >
        Iniciar sesión
      </a>
    );
  }

  const handleLogout = () => {
    clearToken();
    window.location.href = "/";
  };

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Menú de usuario"
          className="flex items-center gap-2 rounded-full py-0.5 pr-1 pl-0.5 outline-none transition hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <Avatar className="after:hidden">
            <AvatarFallback className="bg-primary font-semibold text-primary-foreground">
              {getInitials(user)}
            </AvatarFallback>
          </Avatar>
          <span className="hidden max-w-40 truncate text-sm font-medium sm:inline">
            {firstName(user)}
          </span>
          <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 p-2">
        <div className="flex items-center gap-3 px-1 py-1.5">
          <Avatar className="after:hidden">
            <AvatarFallback className="bg-primary font-semibold text-primary-foreground">
              {getInitials(user)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              {user.name ?? "Cuenta"}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {user.email}
            </p>
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href="/perfil">Mi perfil</a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={handleLogout}>
          <LogOutIcon />
          Salir
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
