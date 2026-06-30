"use client";

import { useEffect, useState } from "react";
import { LogOutIcon } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
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

export function UserMenu() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setUser(getUser());
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

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
          className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <Avatar>
            <AvatarFallback className="bg-primary text-primary-foreground">
              {getInitials(user)}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="text-sm font-medium text-foreground">
          {user.name ?? user.email}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={handleLogout}>
          <LogOutIcon />
          Salir
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
