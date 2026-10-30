export function allowedOrigins(frontendOrigin: string, environment: string) {
  const origins = new Set([new URL(frontendOrigin).origin]);
  if (environment !== "production") {
    origins.add("http://localhost:5173");
    origins.add("http://127.0.0.1:5173");
  }
  return origins;
}
