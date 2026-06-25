/* webworker */
// Folio — search worker (P4.4).
//
// Owns a long-lived FlexSearch.Document index and answers index/search/update/
// remove messages from hooks/useSearch. All real logic lives in the pure
// lib/searchIndex module; this file is just the message pump so the build can
// ship it as a dedicated worker (instantiated via
// new Worker(new URL("./search-worker.ts", import.meta.url), { type: "module" })).
//
// `self` is the worker global; we type a minimal surface rather than pulling in
// the webworker lib (which clashes with the DOM lib in this app's tsconfig).

import {
  createSearchIndex,
  indexFiles,
  removeIndex,
  searchIndex,
  updateIndex,
  type WorkerInbound,
  type WorkerOutbound,
} from "./searchIndex";

interface WorkerGlobal {
  onmessage: ((e: MessageEvent<WorkerInbound>) => void) | null;
  postMessage(message: WorkerOutbound): void;
}

const ctx = self as unknown as WorkerGlobal;
const index = createSearchIndex();

ctx.onmessage = (e: MessageEvent<WorkerInbound>) => {
  const message = e.data;
  switch (message.type) {
    case "index":
      indexFiles(index, message.payload);
      ctx.postMessage({ type: "indexed" });
      break;
    case "search":
      ctx.postMessage({
        type: "results",
        payload: searchIndex(index, message.payload.query, message.payload.filter),
      });
      break;
    case "update":
      updateIndex(index, message.payload);
      break;
    case "remove":
      removeIndex(index, message.payload);
      break;
  }
};
