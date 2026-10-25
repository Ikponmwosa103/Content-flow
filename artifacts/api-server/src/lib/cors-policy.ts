type CorsEnvironment = Record<string, string | undefined>;

function normalizeOrigin(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export function getAllowedCorsOrigins(
  env: CorsEnvironment = process.env,
): Set<string> {
  const configured = [
    ...(env.CORS_ALLOWED_ORIGINS ?? "").split(","),
    env.NETLIFY_URL ?? "",
    env.DEPLOY_PRIME_URL ?? "",
  ];

  return new Set(
    configured
      .map(normalizeOrigin)
      .filter((origin): origin is string => origin !== null),
  );
}

export function isAllowedCorsOrigin(
  origin: string | undefined,
  requestHost: string | undefined,
  allowedOrigins: ReadonlySet<string>,
): boolean {
  if (!origin) return true;

  const normalizedOrigin = normalizeOrigin(origin);
  if (!normalizedOrigin) return false;

  const originHost = new URL(normalizedOrigin).host.toLowerCase();
  if (requestHost?.trim().toLowerCase() === originHost) return true;
  return allowedOrigins.has(normalizedOrigin);
}
