const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const nodemailer = require('nodemailer');
const util   = require('util');
const crypto = require('crypto');

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 820,
    minWidth: 900,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'SMTP Tester',
    backgroundColor: '#1e1e2e',
  });

  win.loadFile('index.html');
  win.setMenuBarVisibility(false);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.handle('send-email', async (event, config) => {
  const logs = [];

  function collectLog(level, data, fmt, ...args) {
    let message;
    if (fmt !== undefined) {
      message = args.length > 0 ? util.format(fmt, ...args) : String(fmt);
    } else if (typeof data === 'string') {
      message = data;
    } else {
      message = JSON.stringify(data);
    }

    let prefix = '   ';
    if (data && typeof data === 'object') {
      if (data.tnx === 'client') prefix = '>>';
      else if (data.tnx === 'server') prefix = '<<';
    }
    logs.push({ level, text: `${prefix} ${message}` });
  }

  const customLogger = {
    trace: (data, fmt, ...args) => collectLog('trace', data, fmt, ...args),
    debug: (data, fmt, ...args) => collectLog('debug', data, fmt, ...args),
    info:  (data, fmt, ...args) => collectLog('info',  data, fmt, ...args),
    warn:  (data, fmt, ...args) => collectLog('warn',  data, fmt, ...args),
    error: (data, fmt, ...args) => collectLog('error', data, fmt, ...args),
    fatal: (data, fmt, ...args) => collectLog('fatal', data, fmt, ...args),
  };

  const mailOptions = {
    from: config.from,
    to: config.to,
    subject: config.subject,
  };

  if (config.contentType === 'html') {
    mailOptions.html = config.body;
  } else {
    mailOptions.text = config.body;
  }

  // ── SES API mode ────────────────────────────────────────────────
  if (config.sendMode === 'ses') {
    logs.push({ level: 'info',  text: `   AWS SES API` });
    logs.push({ level: 'info',  text: `   Region:  ${config.sesRegion}` });
    logs.push({ level: 'debug', text: `>> SendRawEmail` });
    logs.push({ level: 'debug', text: `   From:    ${config.from}` });
    logs.push({ level: 'debug', text: `   To:      ${config.to}` });
    logs.push({ level: 'debug', text: `   Subject: ${config.subject}` });

    try {
      const { SESClient } = require('@aws-sdk/client-ses');
      const awsSes = require('@aws-sdk/client-ses');

      const ses = new SESClient({
        region: config.sesRegion || 'us-east-1',
        credentials: {
          accessKeyId: config.sesKeyId,
          secretAccessKey: config.sesSecretKey,
        },
      });

      const transporter = nodemailer.createTransport({ SES: { ses, aws: awsSes } });
      const info = await transporter.sendMail(mailOptions);

      logs.push({ level: 'info', text: `<< 200 OK` });
      if (info.messageId) logs.push({ level: 'info', text: `   Message-ID: ${info.messageId}` });

      return { success: true, messageId: info.messageId, response: 'Accepted by SES', logs };
    } catch (err) {
      logs.push({ level: 'error', text: `   Error: ${err.name || err.code}: ${err.message}` });
      if (err.$metadata) {
        logs.push({ level: 'error', text: `   HTTP ${err.$metadata.httpStatusCode} — Request-ID: ${err.$metadata.requestId}` });
      }
      return { success: false, error: err.message, code: err.name || err.code, logs };
    }
  }

  // ── SMTP mode ────────────────────────────────────────────────────
  try {
    const transportConfig = {
      host: config.host,
      port: parseInt(config.port, 10),
      secure: config.security === 'ssl',
      requireTLS: config.security === 'starttls',
      tls: {
        rejectUnauthorized: !config.allowSelfSigned,
      },
      debug: true,
      logger: customLogger,
    };

    if (config.useAuth && config.authUser) {
      transportConfig.auth = {
        user: config.authUser,
        pass: config.authPass,
      };
    }

    const transporter = nodemailer.createTransport(transportConfig);
    const info = await transporter.sendMail(mailOptions);

    return {
      success: true,
      messageId: info.messageId,
      response: info.response,
      logs,
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
      code: err.code,
      logs,
    };
  }
});

ipcMain.handle('derive-ses-smtp', (event, { region, keyId, secretKey }) => {
  const hmac = (key, msg) => crypto.createHmac('sha256', key).update(msg).digest();

  const VERSION_BYTE = 0x04;
  const kDate        = hmac('AWS4' + secretKey, '11111111');
  const kRegion      = hmac(kDate,    region);
  const kService     = hmac(kRegion,  'ses');
  const kCredentials = hmac(kService, 'aws4_request');
  const signature    = hmac(kCredentials, 'SendRawEmail');

  return {
    host:     `email-smtp.${region}.amazonaws.com`,
    port:     587,
    username: keyId,
    password: Buffer.concat([Buffer.from([VERSION_BYTE]), signature]).toString('base64'),
  };
});
