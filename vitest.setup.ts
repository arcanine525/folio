import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// Tear down rendered components between tests so the DOM never leaks state.
afterEach(() => {
  cleanup();
});

// jsdom does not implement matchMedia; some UI libs (and our own code) may read it.
if (!window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

// OPFS and the File System Access API are absent in jsdom. The in-memory mock
// in __mocks__/opfs.ts installs the globals before any test imports lib/opfs.
import "@/__mocks__/opfs";

// IndexedDB is also absent in jsdom. __mocks__/indexeddb.ts installs the
// `indexedDB` global before any test imports lib/indexeddb.
import "@/__mocks__/indexeddb";

// Run component/hook tests in React's act() environment.
vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
