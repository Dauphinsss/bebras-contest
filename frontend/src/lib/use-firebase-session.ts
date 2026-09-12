import { useSyncExternalStore } from "react";

import {
  firebaseServerSnapshot,
  firebaseSnapshot,
  subscribeFirebase,
} from "./firebase-auth";

/** Estado de Firebase Authentication compartido por todos los componentes. */
export function useFirebaseSession() {
  return useSyncExternalStore(
    subscribeFirebase,
    firebaseSnapshot,
    firebaseServerSnapshot,
  );
}
