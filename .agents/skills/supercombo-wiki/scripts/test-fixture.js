const responses = JSON.parse(process.env.SUPERCOMBO_TEST_RESPONSES ?? "[]");
let requestIndex = 0;

globalThis.fetch = async (input, init = {}) => {
  const response = responses[requestIndex++];
  if (!response) {
    throw new Error("No test response configured");
  }

  if (response.expected) {
    const url = new URL(input);
    const headers = new Headers(init.headers);
    const actual = {
      origin: url.origin,
      pathname: url.pathname,
      method: init.method,
      userAgent: headers.get("user-agent"),
      params: Object.fromEntries(url.searchParams),
    };
    const expected = response.expected;
    for (const [key, value] of Object.entries(expected)) {
      if (key === "params") {
        for (const [name, parameter] of Object.entries(value)) {
          if (actual.params[name] !== parameter) {
            throw new Error(
              `Expected parameter ${name}=${parameter}, got ${actual.params[name]}`,
            );
          }
        }
      } else if (actual[key] !== value) {
        throw new Error(`Expected ${key}=${value}, got ${actual[key]}`);
      }
    }
  }

  if (response.networkError) {
    throw new TypeError(response.networkError);
  }

  return new Response(JSON.stringify(response.body), {
    status: response.status ?? 200,
    headers: { "content-type": "application/json" },
  });
};
