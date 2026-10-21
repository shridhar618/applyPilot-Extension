import { extractJob } from "../adapters";

// Injected on demand (never persistent, never on pages the user hasn't acted on). Exposes one function; the service worker calls it.
declare global { interface Window { __applypilotExtract?: () => ReturnType<typeof extractJob> } }
window.__applypilotExtract = () => extractJob(document, location.href);
