import { Generator, getConfig } from "@tanstack/router-generator";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
await new Generator({ root, config: getConfig({ target: "react", autoCodeSplitting: true }, root) }).run();
