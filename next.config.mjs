/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { authInterrupts: true },
  serverExternalPackages: ["exceljs", "ldapts"],
  webpack(config, { isServer }) {
    if (isServer) {
      const externals = Array.isArray(config.externals) ? config.externals : [config.externals].filter(Boolean);
      externals.push("archiver");
      config.externals = externals;
    }
    return config;
  },
};

export default nextConfig;
