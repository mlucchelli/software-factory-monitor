import { allowedHosts } from "../config";

const LOCAL_HOST = /^(127\.0\.0\.1|localhost)(:\d+)?$/;

/** Local always; any other name only when `AGENTS_MONITOR_ALLOWED_HOSTS` lists it. */
export function isAllowedHost(host: string, allowed: string[]): boolean {
  const name = host.toLowerCase();
  return (
    LOCAL_HOST.test(name) ||
    allowed.includes(name) ||
    allowed.includes(name.replace(/:\d+$/, ""))
  );
}

/**
 * Actions type into terminals, so only this app's own pages may call them: the Host must be one
 * the monitor is meant to be opened at (blocks DNS rebinding) and the Origin must match it (blocks
 * cross-site form posts and fetches). This is not authentication: whoever can open the page can
 * use it, so a monitor on another machine belongs behind a private network.
 */
export function rejectForeignRequest(
  request: Request,
  allowed: string[] = allowedHosts,
): Response | null {
  const host = request.headers.get("host") ?? "";
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  const json = request.headers
    .get("content-type")
    ?.startsWith("application/json");
  let originHost: string | undefined;
  try {
    originHost = origin ? new URL(origin).host : undefined;
  } catch {
    originHost = undefined;
  }
  if (
    !isAllowedHost(host, allowed) ||
    originHost !== host ||
    (fetchSite !== null && fetchSite !== "same-origin") ||
    !json
  ) {
    return Response.json(
      { error: "Only this app's own pages can do this" },
      { status: 403 },
    );
  }
  return null;
}
