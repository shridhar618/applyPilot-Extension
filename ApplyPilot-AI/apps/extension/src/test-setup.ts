import "@testing-library/jest-dom/vitest";

// jsdom lacks matchMedia (framer-motion's reduced-motion check uses it); default to "reduce" so animations resolve instantly in tests.
Object.defineProperty(window, "matchMedia", { writable: true, value: (q: string) => ({ matches: q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }) });
