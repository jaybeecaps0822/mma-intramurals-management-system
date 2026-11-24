import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["read-excel-file", "onnxruntime-web"],
  outputFileTracingIncludes: { "/api/workspace/*": ["./models/*.onnx", "./node_modules/onnxruntime-web/dist/*.wasm", "./node_modules/onnxruntime-web/dist/ort-wasm-*.mjs"] },
  async headers() {
    return [
      { source: "/:path*", headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Content-Security-Policy", value: "base-uri 'self'; object-src 'none'" },
        { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
      ] },
      { source: "/:role(admin|adviser|student)/:path*", headers: [{ key: "X-Frame-Options", value: "DENY" }, { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" }] },
    ];
  },
};
export default nextConfig;
