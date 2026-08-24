import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 is a native module: keep it out of the bundler and require it at runtime.
  serverExternalPackages: ["better-sqlite3"],

  async rewrites() {
    return [
      // Android insists on this exact path when it verifies that the app in the
      // Play Store belongs to this server. A folder called ".well-known" under
      // app/ would be an awkward thing to have in the routing tree, so the
      // route lives somewhere sensible and is served from there.
      { source: "/.well-known/assetlinks.json", destination: "/api/assetlinks" },
    ];
  },
};

export default nextConfig;
