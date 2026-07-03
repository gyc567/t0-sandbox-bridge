/**
 * Pre-install a DOM-like global for tests that need React rendering.
 * Loaded via `bun test --preload`.
 */
import { Window } from "happy-dom";

const window = new Window();
const g = globalThis as unknown as Record<string, unknown>;
g.window = window;
g.document = window.document;
g.navigator = window.navigator;
g.HTMLElement = window.HTMLElement;
g.Element = window.Element;
g.Node = window.Node;
g.MutationObserver = window.MutationObserver;
g.requestAnimationFrame = window.requestAnimationFrame.bind(window);
g.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
g.matchMedia = window.matchMedia.bind(window);
g.getComputedStyle = window.getComputedStyle.bind(window);