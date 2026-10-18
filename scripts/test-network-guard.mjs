// Tests run offline. A missed mock must never send a request to a real tenant.
const fetchBeforeTests = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  if (["data:", "blob:"].includes(url.protocol)) return fetchBeforeTests(input, init);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    throw new Error(`Network disabled in tests: ${url.hostname}`);
  }
  return fetchBeforeTests(input, init);
};
