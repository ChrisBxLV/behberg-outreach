type HeaderValue = string | string[] | undefined;

function pickFirstHeader(value: HeaderValue): string {
  if (Array.isArray(value)) return (value[0] ?? "").trim();
  return (value ?? "").trim();
}

export function inferRequestOrigin(input: {
  protocol?: string;
  headers?: Record<string, HeaderValue>;
}): string {
  const headers = input.headers ?? {};
  const forwardedProto = pickFirstHeader(headers["x-forwarded-proto"]);
  const forwardedHost = pickFirstHeader(headers["x-forwarded-host"]);
  const host = forwardedHost || pickFirstHeader(headers.host);
  if (!host) return "";

  const proto =
    forwardedProto ||
    (input.protocol && input.protocol.trim()) ||
    "https";
  return `${proto.toLowerCase()}://${host}`;
}
