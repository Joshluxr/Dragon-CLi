import { createStore } from "jotai";

let store: ReturnType<typeof createStore> | null = null;

export function getOrCreateStore() {
  // On server, create a new store for each request
  if (typeof window === "undefined") {
    return createStore();
  }
  if (!store) {
    store = createStore();
  }
  return store;
}
