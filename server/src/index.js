const http = require('http');
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { Server } = require('socket.io');

const env = require('./env');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const { registerSignaling } = require('./sockets/signaling');

const authRoutes = require('./routes/auth.routes');
const walletRoutes = require('./routes/wallet.routes');
const hostsRoutes = require('./routes/hosts.routes');
const callsRoutes = require('./routes/calls.routes');
const withdrawalsRoutes = require('./routes/withdrawals.routes');
const moderationRoutes = require('./routes/moderation.routes');

const app = express();
// Disable Helmet's default Content-Security-Policy: it sets `script-src 'self'`
// + `script-src-attr 'none'`, which blocks the inline JS and onclick handlers
// the admin dashboard (/admin.html) relies on. Other Helmet protections stay on.
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.json({ ok: true }));

// Static pages served straight from the API: legal pages + the admin dashboard.
//   /privacy.html   /terms.html   /admin.html
// HTML is served with no-cache so dashboard updates always load fresh (avoids
// browsers pinning a stale admin page).
app.use(
  express.static(path.join(__dirname, '..', 'public'), {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      }
    },
  }),
);

app.use('/auth', authRoutes);
app.use('/wallet', walletRoutes);
app.use('/hosts', hostsRoutes);
app.use('/calls', callsRoutes);
app.use('/withdrawals', withdrawalsRoutes);
app.use('/moderation', moderationRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
registerSignaling(io);

server.listen(env.port, () => {
  console.log(`videochat-server listening on :${env.port} (${env.nodeEnv})`);
});
