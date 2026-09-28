function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function compile(pattern) {
  const keys = [];
  const source = pattern.replace(/:(\w+)/g, (_, key) => {
    keys.push(key);
    return '([^/]+)';
  });
  return { regex: new RegExp(`^${source}$`), keys };
}

export function createRouter() {
  const routes = [];

  const add = (method, pattern, handler, options = {}) => {
    routes.push({ method, pattern, handler, ...compile(pattern), ...options });
  };

  const match = (method, pathname) => {
    for (const route of routes) {
      if (route.method !== method) continue;
      const found = route.regex.exec(pathname);
      if (!found) continue;
      const values = found.slice(1).map(safeDecode);
      if (values.includes(null)) return null;
      return { route, params: Object.fromEntries(route.keys.map((key, index) => [key, values[index]])) };
    }
    return null;
  };

  return {
    match,
    get: (pattern, handler, options) => add('GET', pattern, handler, options),
    post: (pattern, handler, options) => add('POST', pattern, handler, options),
    patch: (pattern, handler, options) => add('PATCH', pattern, handler, options),
  };
}
