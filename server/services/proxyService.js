import http from 'node:http';
import net from 'node:net';
import { parsePublicUrl, resolvePublic } from '../utils/url.js';
// Every outbound connection is DNS-checked and pinned, including redirects and CDN requests.
// This proxy is loopback-only and never exposed as a general-purpose public proxy.
export async function startProxy() {
  const sockets = new Set();
  const track = (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    return socket;
  };
  const proxy = http.createServer(async (req, res) => {
    try {
      const url = parsePublicUrl(req.url);
      if (url.protocol !== 'http:') throw new Error('Use CONNECT for HTTPS');
      const { address, family } = await resolvePublic(url.hostname);
      const headers = { ...req.headers, host: url.host };
      delete headers['proxy-authorization'];
      delete headers['proxy-connection'];
      const upstream = http.request(
        {
          hostname: address,
          family,
          port: Number(url.port || 80),
          path: url.pathname + url.search,
          method: req.method,
          headers,
          timeout: 120000,
        },
        (response) => {
          res.writeHead(response.statusCode, response.headers);
          response.pipe(res);
        },
      );
      upstream.on('socket', track);
      upstream.on('timeout', () => upstream.destroy());
      upstream.on('error', () => {
        if (!res.headersSent) res.writeHead(502);
        res.end();
      });
      req.on('aborted', () => upstream.destroy());
      res.on('close', () => upstream.destroy());
      req.pipe(upstream);
    } catch {
      res.writeHead(403);
      res.end('Outbound address blocked');
    }
  });
  proxy.on('connection', track);
  proxy.on('connect', async (req, client, head) => {
    try {
      const url = parsePublicUrl('https://' + req.url);
      if (url.pathname !== '/' || url.search || url.hash) throw new Error('Invalid tunnel');
      const { address, family } = await resolvePublic(url.hostname);
      if (client.destroyed) return;
      const upstream = track(net.connect({ host: address, family, port: Number(url.port || 443) }));
      upstream.setTimeout(600000, () => upstream.destroy());
      upstream.on('connect', () => {
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head.length) upstream.write(head);
        upstream.pipe(client);
        client.pipe(upstream);
      });
      upstream.on('error', () => client.destroy());
      upstream.on('close', () => client.destroy());
      client.on('close', () => upstream.destroy());
    } catch {
      client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    }
  });
  await new Promise((resolve, reject) => {
    proxy.once('error', reject);
    proxy.listen(0, '127.0.0.1', resolve);
  });
  return {
    url: `http://127.0.0.1:${proxy.address().port}`,
    close: () => {
      for (const s of sockets) s.destroy();
      proxy.close();
    },
  };
}
