// Starts headless Microsoft Edge and talks to it over the Chrome DevTools Protocol.
// Used by make-icons.mjs, store-shots.mjs and the end-to-end tests. No dependencies.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const EDGE = process.env.EDGE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function client(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const listeners = new Map();
  const handlers = new Map();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    } else if (msg.method) {
      handlers.get(msg.method)?.(msg.params);
      if (listeners.has(msg.method)) {
        listeners.get(msg.method)(msg.params);
        listeners.delete(msg.method);
      }
    }
  };
  const ready = new Promise((r) => (ws.onopen = r));
  return {
    ready,
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        pending.set(++id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });
    },
    once: (method) => new Promise((r) => listeners.set(method, r)),
    on: (method, fn) => handlers.set(method, fn),
    close: () => ws.close(),
  };
}

// Starts Edge and returns { page, close }.
// page.open(url, view) navigates; page.eval(js) runs async JS and returns its value;
// page.shot() returns PNG bytes; page.errors collects uncaught page errors and console.error calls.
export async function launchEdge() {
  const port = 9300 + Math.floor(Math.random() * 600);
  const profile = mkdtempSync(path.join(tmpdir(), 'edge-'));
  const edge = spawn(EDGE, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--hide-scrollbars', '--mute-audio', 'about:blank',
  ], { stdio: 'ignore' });
  const close = async () => {
    edge.kill();
    await sleep(500);
    try {
      rmSync(profile, { recursive: true, force: true });
    } catch {
      /* Edge may still hold a lock on its temp profile; the OS cleans it up */
    }
  };
  try {
    let target;
    for (let i = 0; i < 50 && !target; i++) {
      try {
        target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
      } catch {
        await sleep(200);
      }
    }
    if (!target) throw new Error('Edge did not start. Set EDGE to the path of msedge.exe.');
    const cdp = client(target.webSocketDebuggerUrl);
    await cdp.ready;
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    const errors = [];
    cdp.on('Runtime.exceptionThrown', (p) => errors.push(p.exceptionDetails.exception?.description || p.exceptionDetails.text));
    cdp.on('Runtime.consoleAPICalled', (p) => p.type === 'error' && errors.push(p.args.map((a) => a.value ?? a.description).join(' ')));
    const page = {
      cdp,
      errors,
      async open(url, view) {
        await cdp.send('Emulation.setDeviceMetricsOverride', view);
        await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: !!view.mobile });
        const loaded = cdp.once('Page.loadEventFired');
        await cdp.send('Page.navigate', { url });
        await loaded;
      },
      async eval(js) {
        const r = await cdp.send('Runtime.evaluate', { expression: `(async () => { ${js} })()`, awaitPromise: true, returnByValue: true });
        if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'script failed');
        return r.result.value;
      },
      async shot({ transparent = false } = {}) {
        if (transparent) await cdp.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
        const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
        if (transparent) await cdp.send('Emulation.setDefaultBackgroundColorOverride', {});
        return Buffer.from(data, 'base64');
      },
    };
    return {
      page,
      close: async () => {
        cdp.close();
        await close();
      },
    };
  } catch (e) {
    await close();
    throw e;
  }
}

// Runs `fn(page)` against a fresh headless Edge, then cleans up.
export async function withEdge(fn) {
  const { page, close } = await launchEdge();
  try {
    await fn(page);
  } finally {
    await close();
  }
}
