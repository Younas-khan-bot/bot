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
app.use(helmet());
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.json({ ok: true }));

// Static legal pages (Privacy Policy / Terms) served straight from the API so
// the required Play Store URLs work regardless of repo visibility:
//   https://<host>/privacy.html   https://<host>/terms.html
app.use(express.static(path.join(__dirname, '..', 'public')));

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
