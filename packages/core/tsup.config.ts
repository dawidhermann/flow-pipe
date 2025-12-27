import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/RequestAdapter.ts",
    "src/RequestManager.ts",
    "src/RequestChain.ts",
    "src/models/RequestParams.ts",
    "src/models/Handlers.ts",
  ],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  outDir: "./build",
  target: "es2020",
  splitting: false,
  treeshake: true,
});

