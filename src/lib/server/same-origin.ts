const LOCAL_HOST = /^(127\.0\.0\.1|localhost)(:\d+)?$/;

/**
 * Actions type into terminals, so only this app's own pages may call them: the Host must be local
 * (blocks DNS rebinding) and the Origin must match it (blocks cross-site form posts and fetches).
 */
export function rejectForeignRequest(request: Request): Response | null {
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
    !LOCAL_HOST.test(host) ||
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
