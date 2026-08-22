/**
 * Ambient declarations for optional native dependencies.
 *
 * These packages are only required when the corresponding feature is enabled
 * (vector memory / local embedding) and are not installed in the default
 * environment. Declaring them as `any` keeps `scripts/typecheck.sh` runnable
 * without pulling native binaries.
 */
declare module "@lancedb/lancedb";
declare module "onnxruntime-node";
declare module "node-llama-cpp";
