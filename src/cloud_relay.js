/* ===========================================================================
   GRLHOOD Factory — Cloud Relay
   Bridges the UXP Photoshop panel (worker, on the Mac) and the control website
   (controller, in any browser). Both sides talk plain HTTP long-poll, so there
   is NO extra npm dependency and it works behind Railway/Vercel/anything.

   Single "room" (one store, one Photoshop): one panel + many controllers.

   Panel  → POST /factory-api/hello  {token, role:"panel"}
          → POST /factory-api/poll   {token, role:"panel"}        (long-poll: commands)
          → POST /factory-api/emit   {token, role:"panel", messages:[...]}  (state/preview/log/result)

   Controller (website) → same endpoints with role:"controller" (+ an id from hello).

   Auth: single shared token in env FACTORY_CLOUD_TOKEN (default "grlhood").
   ======================================================================== */
const path = require('path');

const HOLD_MS = 25000;      // long-poll hold
const PANEL_TTL = 45000;    // panel considered offline after this silence
const CTRL_TTL = 60000;     // drop a controller after this silence

function makeRelay() {
  const TOKEN = process.env.FACTORY_CLOUD_TOKEN || 'grlhood';
  if (!process.env.FACTORY_CLOUD_TOKEN) {
    console.warn('⚠  FACTORY_CLOUD_TOKEN not set — using default "grlhood". Set it in Railway for security.');
  }

  const room = {
    panel: null,               // { lastSeen, queue:[], waiters:[] }
    controllers: new Map(),    // id -> { lastSeen, queue:[], waiters:[] }
    ctrlSeq: 1,
  };

  const now = () => Date.now();

  function panelOnline() {
    return !!(room.panel && (now() - room.panel.lastSeen) < PANEL_TTL);
  }

  // deliver queued messages to any parked long-poll for a client
  function flush(client) {
    if (!client || !client.waiters.length || !client.queue.length) return;
    const messages = client.queue.splice(0, client.queue.length);
    for (const w of client.waiters.splice(0, client.waiters.length)) {
      clearTimeout(w.timer);
      try { w.res.json({ ok: true, messages }); } catch (_) {}
    }
  }

  function pushToPanel(messages) {
    if (!room.panel) return;
    room.panel.queue.push(...messages);
    flush(room.panel);
  }

  function broadcastToControllers(messages) {
    for (const c of room.controllers.values()) {
      c.queue.push(...messages);
      flush(c);
    }
  }

  function notifyPanelStatus() {
    broadcastToControllers([{ t: 'panelStatus', online: panelOnline() }]);
  }

  // periodic reaper: mark panel offline / drop stale controllers
  let lastPanelState = false;
  setInterval(() => {
    const isOn = panelOnline();
    if (isOn !== lastPanelState) { lastPanelState = isOn; notifyPanelStatus(); }
    for (const [id, c] of room.controllers) {
      if (now() - c.lastSeen > CTRL_TTL && !c.waiters.length) room.controllers.delete(id);
    }
  }, 5000).unref?.();

  function auth(req, res) {
    const token = (req.body && req.body.token) || req.query.token;
    if (token !== TOKEN) { res.status(401).json({ ok: false, error: 'bad token' }); return false; }
    return true;
  }

  // ---- route handlers ----
  function hello(req, res) {
    if (!auth(req, res)) return;
    const role = (req.body && req.body.role) || 'controller';
    if (role === 'panel') {
      room.panel = room.panel || { lastSeen: 0, queue: [], waiters: [] };
      room.panel.lastSeen = now();
      notifyPanelStatus();
      return res.json({ ok: true, role: 'panel' });
    }
    const id = 'c' + (room.ctrlSeq++);
    room.controllers.set(id, { lastSeen: now(), queue: [], waiters: [] });
    return res.json({ ok: true, role: 'controller', id, panelOnline: panelOnline() });
  }

  function poll(req, res) {
    if (!auth(req, res)) return;
    const role = (req.body && req.body.role) || 'controller';
    let client;
    if (role === 'panel') {
      room.panel = room.panel || { lastSeen: 0, queue: [], waiters: [] };
      room.panel.lastSeen = now();
      if (!lastPanelState) { lastPanelState = true; notifyPanelStatus(); }
      client = room.panel;
    } else {
      const id = req.body && req.body.id;
      client = room.controllers.get(id);
      if (!client) { // controller expired — tell it to re-hello
        return res.status(409).json({ ok: false, error: 'unknown controller', rehello: true });
      }
      client.lastSeen = now();
    }
    if (client.queue.length) {
      const messages = client.queue.splice(0, client.queue.length);
      return res.json({ ok: true, messages });
    }
    // park it
    const waiter = { res, timer: null };
    waiter.timer = setTimeout(() => {
      const i = client.waiters.indexOf(waiter);
      if (i >= 0) client.waiters.splice(i, 1);
      try { res.json({ ok: true, messages: [] }); } catch (_) {}
    }, HOLD_MS);
    client.waiters.push(waiter);
    req.on('close', () => {
      const i = client.waiters.indexOf(waiter);
      if (i >= 0) { clearTimeout(waiter.timer); client.waiters.splice(i, 1); }
    });
  }

  function emit(req, res) {
    if (!auth(req, res)) return;
    const role = (req.body && req.body.role) || 'controller';
    const messages = (req.body && req.body.messages) || [];
    if (!Array.isArray(messages) || !messages.length) return res.json({ ok: true });
    if (role === 'panel') {
      room.panel = room.panel || { lastSeen: 0, queue: [], waiters: [] };
      room.panel.lastSeen = now();
      broadcastToControllers(messages);
    } else {
      const id = req.body && req.body.id;
      const c = room.controllers.get(id);
      if (c) c.lastSeen = now();
      pushToPanel(messages);
    }
    return res.json({ ok: true, panelOnline: panelOnline() });
  }

  function status(req, res) {
    res.json({ ok: true, panelOnline: panelOnline(), controllers: room.controllers.size });
  }

  return { hello, poll, emit, status };
}

/* Mount relay routes + the control website onto an existing express app.
   Call this BEFORE the SPA catch-all route. */
function mountCloud(app) {
  const r = makeRelay();
  app.post('/factory-api/hello', r.hello);
  app.post('/factory-api/poll', r.poll);
  app.post('/factory-api/emit', r.emit);
  app.get('/factory-api/status', r.status);
  app.get('/factory', (req, res) => {
    res.sendFile(path.join(__dirname, 'cloud', 'factory.html'));
  });
  console.log('☁  GRLHOOD Factory cloud relay mounted at /factory (control) + /factory-api/* (relay)');
}

module.exports = { mountCloud, makeRelay };
