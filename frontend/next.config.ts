import path from "node:path";
import type { NextConfig } from "next";
import shared from "../next.config";

const root = path.resolve(__dirname, "..");
const config: NextConfig = {
  ...shared,
  output: undefined,
  serverExternalPackages: ["sharp"],
  turbopack: {
    root,
  },
};
export default config;
