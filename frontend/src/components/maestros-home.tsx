"use client";

import { useEffect, useState } from "react";
import { CheckIcon, LoaderCircleIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

import {
  approveMaestro,
  listMaestros,
  rejectMaestro,
  type Maestro,
} from "@/lib/users-api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  approved: "Aprobado",
  rejected: "Rechazado",
};

export function MaestrosHome() {
  const [maestros, setMaestros] = useState<Maestro[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    void listMaestros()
      .then((loaded) => {
        if (active) {
          setMaestros(loaded);
        }
      })
      .catch((error: unknown) => {
        toast.error(
          error instanceof Error ? error.message : "No se pudieron cargar los maestros.",
        );
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const updateStatus = (maestro: Maestro, status: string) => {
    const action = status === "approved" ? approveMaestro : rejectMaestro;
    void action(maestro.id)
      .then(() => {
        setMaestros((current) =>
          current.map((item) =>
            item.id === maestro.id ? { ...item, status } : item,
          ),
        );
        toast.success(
          status === "approved" ? "Maestro aprobado." : "Maestro rechazado.",
        );
      })
      .catch((error) => {
        toast.error(
          error instanceof Error ? error.message : "No se pudo actualizar.",
        );
      });
  };

  if (loading) {
    return (
      <div className="flex min-h-72 items-center justify-center">
        <LoaderCircleIcon className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Maestros</CardTitle>
        <CardDescription>
          Aprueba o rechaza las solicitudes de cuenta de los maestros.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 pt-6">
        {maestros.length === 0 ? (
          <Alert>
            <AlertTitle>Aún no hay maestros</AlertTitle>
            <AlertDescription>
              Cuando un maestro se registre, aparecerá aquí para que lo apruebes.
            </AlertDescription>
          </Alert>
        ) : (
          maestros.map((maestro) => (
            <Card key={maestro.id} variant="soft-gradient" className="gap-3 py-4">
              <CardHeader className="gap-3">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant={
                          maestro.status === "approved"
                            ? "secondary"
                            : "outline"
                        }
                      >
                        {STATUS_LABEL[maestro.status] ?? maestro.status}
                      </Badge>
                    </div>
                    <CardTitle className="text-lg">
                      {maestro.name ?? maestro.email}
                    </CardTitle>
                    <CardDescription>{maestro.email}</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    {maestro.status !== "approved" && (
                      <Button
                        size="sm"
                        type="button"
                        onClick={() => updateStatus(maestro, "approved")}
                      >
                        <CheckIcon data-icon="inline-start" />
                        Aprobar
                      </Button>
                    )}
                    {maestro.status !== "rejected" && (
                      <Button
                        size="sm"
                        type="button"
                        variant="outline"
                        onClick={() => updateStatus(maestro, "rejected")}
                      >
                        <XIcon data-icon="inline-start" />
                        Rechazar
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))
        )}
      </CardContent>
    </Card>
  );
}
