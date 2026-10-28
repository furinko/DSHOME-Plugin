/* Explicit in-process carrier fixture. Install the public connection.rpc
 * interception surface and let the actual SDK Gateway register its own handler.
 * Never call private Gateway methods or reconstruct the SDK's result codec. */
export function createGatewayCarrier(ctx, connectionExtras = {}) {
  const routes = new Set(), ready = Promise.withResolvers();
  ctx.reflect.provide('connection', { ...connectionExtras, rpc: {
    intercept(prefix, claims, handler) {
      const route = { prefix, claims, handler }; routes.add(route); ready.resolve();
      const release = () => routes.delete(route); ctx.effect(() => release); return release;
    },
  } });
  return Object.freeze({
    async call(prefix, endpoint, payload, signal, peer) {
      await ready.promise;
      const route = [...routes].find(route => route.prefix === prefix && route.claims(endpoint));
      if (!route) throw Error('No SDK RPC interceptor claims ' + endpoint);
      return route.handler(endpoint, payload, signal, peer);
    },
    async *open(gateway, endpoint, payload, signal, peer, uplink = (async function* () {})()) {
      yield* await gateway.wireStream.open(endpoint, payload, uplink, peer, signal);
    },
  });
}
