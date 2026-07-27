import { authHeaders, handleUnauthorized } from "@/lib/auth";
import { API_BASE_URL, apiRequest as request } from "@/lib/api-client";

export type Maestro = {
  id: number;
  name: string | null;
  email: string;
  status: string;
  schoolName: string | null;
  phone: string | null;
  isHomeschool: boolean;
  hasLetter: boolean;
  hasIdFront: boolean;
  hasIdBack: boolean;
  createdAt: string;
};

export function listMaestros() {
  return request<Maestro[]>("/api/users/maestros");
}

export function approveMaestro(id: number) {
  return request<{ id: number; status: string }>(`/api/users/${id}/approve`, {
    method: "POST",
  });
}

export function rejectMaestro(id: number) {
  return request<{ id: number; status: string }>(`/api/users/${id}/reject`, {
    method: "POST",
  });
}

export type MaestroDoc = "letter" | "idFront" | "idBack";

export async function openMaestroDocument(id: number, doc: MaestroDoc) {
  const tab = window.open("", "_blank");

  try {
    const response = await fetch(
      `${API_BASE_URL}/api/users/${id}/documents/${doc}`,
      { headers: { ...authHeaders() } },
    );

    if (response.status === 401 || response.status === 403) {
      handleUnauthorized();
      throw new Error("Sesión expirada. Inicia sesión de nuevo.");
    }

    if (!response.ok) {
      throw new Error("No se pudo abrir el documento.");
    }

    const type = response.headers.get("content-type") ?? "application/pdf";
    const blob = new Blob([await response.arrayBuffer()], { type });
    const url = URL.createObjectURL(blob);

    if (tab && !tab.closed) {
      tab.location.href = url;
    } else {
      const link = document.createElement("a");
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener";
      link.click();
    }

    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) {
    tab?.close();
    throw error;
  }
}
