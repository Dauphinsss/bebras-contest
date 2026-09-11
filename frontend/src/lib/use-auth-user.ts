import { useSyncExternalStore } from "react";
import { getUser, subscribeSession } from "./auth";

export function useAuthUser() {
  return useSyncExternalStore(subscribeSession, getUser, () => null);
}
