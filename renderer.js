const DEFAULT_TEXT_BODY =
`This is a test email sent from SMTP Tester.

If you can read this, your configuration is working correctly.

--
Sent by SMTP Tester`;

const DEFAULT_HTML_BODY =
`<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #2563eb;">SMTP Test Email</h2>
  <p>This is a test email sent from <strong>SMTP Tester</strong>.</p>
  <p>If you can read this, your configuration is working correctly.</p>
  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
  <p style="color: #9ca3af; font-size: 12px;"><em>Sent by SMTP Tester</em></p>
</body>
</html>`;

// ── Element refs ──────────────────────────────────────────────────
const host            = document.getElementById('host');
const port            = document.getElementById('port');
const security        = document.getElementById('security');
const allowSelfSigned = document.getElementById('allow-self-signed');
const useAuth         = document.getElementById('use-auth');
const authFields      = document.getElementById('auth-fields');
const authUser        = document.getElementById('auth-user');
const authPass        = document.getElementById('auth-pass');
const togglePassBtn   = document.getElementById('toggle-pass');
const smtpFields      = document.getElementById('smtp-fields');
const sesFields       = document.getElementById('ses-fields');
const sesRegion       = document.getElementById('ses-region');
const sesKeyId        = document.getElementById('ses-key-id');
const sesSecretKey    = document.getElementById('ses-secret-key');
const from            = document.getElementById('from');
const to              = document.getElementById('to');
const subject         = document.getElementById('subject');
const body            = document.getElementById('body');
const sendBtn         = document.getElementById('send');
const statusEl        = document.getElementById('status');
const statusIcon      = document.getElementById('status-icon');
const statusText      = document.getElementById('status-text');
const consoleOutput   = document.getElementById('console-output');
const consoleTitle    = document.getElementById('console-title');
const clearConsoleBtn = document.getElementById('clear-console');
const portModal       = document.getElementById('port-modal');

body.value = DEFAULT_TEXT_BODY;

// ── Send mode toggle (SMTP / SES) ─────────────────────────────────
let sendMode = 'smtp';

document.querySelectorAll('input[name="send-mode"]').forEach(radio => {
  radio.addEventListener('change', () => {
    sendMode = radio.value;
    smtpFields.hidden = sendMode !== 'smtp';
    sesFields.hidden  = sendMode !== 'ses';
    consoleTitle.textContent = sendMode === 'ses' ? 'SES API Console' : 'SMTP Console';
  });
});

// ── Content-type switching ────────────────────────────────────────
let lastTextBody = DEFAULT_TEXT_BODY;
let lastHtmlBody = DEFAULT_HTML_BODY;
let currentType  = 'text';

document.querySelectorAll('input[name="content-type"]').forEach(radio => {
  radio.addEventListener('change', () => {
    if (currentType === 'text') lastTextBody = body.value;
    else lastHtmlBody = body.value;
    currentType = radio.value;
    body.value = currentType === 'html' ? lastHtmlBody : lastTextBody;
  });
});

// ── SMTP auth toggle — disable fields rather than hide ────────────
useAuth.addEventListener('change', () => {
  const disabled = !useAuth.checked;
  authUser.disabled = disabled;
  authPass.disabled = disabled;
  togglePassBtn.disabled = disabled;
  authFields.classList.toggle('disabled', disabled);
});

// ── SMTP password toggle ──────────────────────────────────────────
togglePassBtn.addEventListener('click', () => {
  const isHidden = authPass.type === 'password';
  authPass.type = isHidden ? 'text' : 'password';
  document.getElementById('eye-show').hidden = isHidden;
  document.getElementById('eye-hide').hidden = !isHidden;
});

// ── SES secret key toggle ─────────────────────────────────────────
document.getElementById('toggle-ses-secret').addEventListener('click', () => {
  const isHidden = sesSecretKey.type === 'password';
  sesSecretKey.type = isHidden ? 'text' : 'password';
  document.getElementById('ses-eye-show').hidden = isHidden;
  document.getElementById('ses-eye-hide').hidden = !isHidden;
});

// ── Auto-update port when SMTP security changes ───────────────────
security.addEventListener('change', () => {
  const map = { none: 25, starttls: 587, ssl: 465 };
  port.value = map[security.value] || port.value;
});

// ── Port reference modal ──────────────────────────────────────────
document.getElementById('port-info').addEventListener('click', () => {
  portModal.classList.add('active');
});

document.getElementById('close-modal').addEventListener('click', () => {
  portModal.classList.remove('active');
});

portModal.addEventListener('click', e => {
  if (e.target === portModal) portModal.classList.remove('active');
});

const deriveModal = document.getElementById('derive-modal');

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    portModal.classList.remove('active');
    deriveModal.classList.remove('active');
  }
});

document.querySelectorAll('.port-row').forEach(row => {
  row.addEventListener('click', () => {
    port.value = row.dataset.port;
    security.value = row.dataset.security;
    portModal.classList.remove('active');
  });
});

// ── Send ──────────────────────────────────────────────────────────
sendBtn.addEventListener('click', async () => {
  const config = {
    sendMode,
    // SMTP
    host:            host.value.trim(),
    port:            port.value,
    security:        security.value,
    allowSelfSigned: allowSelfSigned.checked,
    useAuth:         useAuth.checked,
    authUser:        authUser.value.trim(),
    authPass:        authPass.value,
    // SES
    sesRegion:       sesRegion.value.trim(),
    sesKeyId:        sesKeyId.value.trim(),
    sesSecretKey:    sesSecretKey.value,
    // Email
    from:            from.value.trim(),
    to:              to.value.trim(),
    subject:         subject.value.trim(),
    contentType:     currentType,
    body:            body.value,
  };

  if (sendMode === 'smtp') {
    if (!config.host) return setStatus('error', '✗', 'Host is required');
  } else {
    if (!config.sesRegion)    return setStatus('error', '✗', 'AWS Region is required');
    if (!config.sesKeyId)     return setStatus('error', '✗', 'Access Key ID is required');
    if (!config.sesSecretKey) return setStatus('error', '✗', 'Secret Access Key is required');
  }

  if (!config.from) return setStatus('error', '✗', 'From address is required');
  if (!config.to)   return setStatus('error', '✗', 'To address is required');

  sendBtn.disabled = true;
  setStatus('sending', '⟳', sendMode === 'ses' ? 'Calling SES API…' : 'Connecting…');
  clearConsole();

  try {
    const result = await window.smtp.sendEmail(config);
    renderLogs(result.logs);

    if (result.success) {
      const resp = result.response ? ` (${result.response})` : '';
      const id   = result.messageId ? ` — Message-ID: ${result.messageId}` : '';
      setStatus('success', '✓', `Sent successfully${resp}${id}`);
    } else {
      const code = result.code ? ` [${result.code}]` : '';
      setStatus('error', '✗', `${result.error}${code}`);
    }
  } catch (err) {
    setStatus('error', '✗', `Unexpected error: ${err.message}`);
  } finally {
    sendBtn.disabled = false;
  }
});

clearConsoleBtn.addEventListener('click', clearConsole);

// ── Derive SES SMTP credentials modal ────────────────────────────
let lastDerived = null;

const deriveRegionInput = document.getElementById('derive-region');
const deriveKeyIdInput  = document.getElementById('derive-key-id');
const deriveSecretInput = document.getElementById('derive-secret');

document.getElementById('open-derive-modal').addEventListener('click', () => {
  // Pre-fill from SES fields if they're populated
  if (sesRegion.value)    deriveRegionInput.value = sesRegion.value;
  if (sesKeyId.value)     deriveKeyIdInput.value  = sesKeyId.value;
  if (sesSecretKey.value) deriveSecretInput.value  = sesSecretKey.value;

  document.getElementById('derive-results').hidden = true;
  lastDerived = null;
  deriveModal.classList.add('active');
});

document.getElementById('close-derive-modal').addEventListener('click', () => {
  deriveModal.classList.remove('active');
});

deriveModal.addEventListener('click', e => {
  if (e.target === deriveModal) deriveModal.classList.remove('active');
});

document.getElementById('toggle-derive-secret').addEventListener('click', () => {
  const isHidden = deriveSecretInput.type === 'password';
  deriveSecretInput.type = isHidden ? 'text' : 'password';
  document.getElementById('derive-eye-show').hidden = isHidden;
  document.getElementById('derive-eye-hide').hidden = !isHidden;
});

document.getElementById('derive-btn').addEventListener('click', async () => {
  const region    = deriveRegionInput.value.trim();
  const keyId     = deriveKeyIdInput.value.trim();
  const secretKey = deriveSecretInput.value;

  if (!region || !keyId || !secretKey) return;

  lastDerived = await window.smtp.deriveSmtp({ region, keyId, secretKey });

  document.getElementById('res-host').textContent     = lastDerived.host;
  document.getElementById('res-username').textContent  = lastDerived.username;
  document.getElementById('res-pass-plain').textContent = lastDerived.password;
  document.getElementById('res-pass-masked').hidden   = false;
  document.getElementById('res-pass-plain').hidden    = true;
  document.getElementById('reveal-pass-btn').textContent = 'Reveal';
  document.getElementById('derive-results').hidden    = false;
});

document.getElementById('reveal-pass-btn').addEventListener('click', () => {
  const masked = document.getElementById('res-pass-masked');
  const plain  = document.getElementById('res-pass-plain');
  const btn    = document.getElementById('reveal-pass-btn');
  if (plain.hidden) {
    masked.hidden = true;
    plain.hidden  = false;
    btn.textContent = 'Hide';
  } else {
    masked.hidden = false;
    plain.hidden  = true;
    btn.textContent = 'Reveal';
  }
});

document.querySelectorAll('.copy-btn[data-result]').forEach(btn => {
  btn.addEventListener('click', () => {
    if (!lastDerived) return;
    const value = lastDerived[btn.dataset.result];
    if (value == null) return;
    navigator.clipboard.writeText(String(value));
    const orig = btn.textContent;
    btn.textContent = 'Copied!';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = orig; btn.classList.remove('copied'); }, 1500);
  });
});

document.getElementById('apply-smtp-btn').addEventListener('click', () => {
  if (!lastDerived) return;

  // Switch to SMTP mode
  document.querySelector('input[name="send-mode"][value="smtp"]').checked = true;
  sendMode = 'smtp';
  smtpFields.hidden = false;
  sesFields.hidden  = true;
  consoleTitle.textContent = 'SMTP Console';

  // Fill server fields
  host.value     = lastDerived.host;
  port.value     = '587';
  security.value = 'starttls';

  // Enable and fill auth
  useAuth.checked        = true;
  authUser.disabled      = false;
  authPass.disabled      = false;
  togglePassBtn.disabled = false;
  authFields.classList.remove('disabled');
  authUser.value = lastDerived.username;
  authPass.value = lastDerived.password;

  // Ensure password is masked
  authPass.type = 'password';
  document.getElementById('eye-show').hidden = false;
  document.getElementById('eye-hide').hidden = true;

  deriveModal.classList.remove('active');
});

function setStatus(cls, icon, text) {
  statusEl.className = cls;
  statusIcon.textContent = icon;
  statusText.textContent = text;
}

function clearConsole() {
  consoleOutput.innerHTML = '<div class="console-empty">Session log will appear here after sending.</div>';
}

function renderLogs(logs) {
  if (!logs || logs.length === 0) {
    consoleOutput.innerHTML = '<div class="console-empty">No log output captured.</div>';
    return;
  }

  const frag = document.createDocumentFragment();

  logs.forEach(entry => {
    const div = document.createElement('div');
    div.className = 'log-line';
    const text = entry.text || '';

    if (text.trimStart().startsWith('>>')) {
      div.classList.add('client');
    } else if (text.trimStart().startsWith('<<')) {
      div.classList.add('server');
    } else if (entry.level === 'warn') {
      div.classList.add('warn');
    } else if (entry.level === 'error' || entry.level === 'fatal') {
      div.classList.add('error');
    } else {
      div.classList.add('info');
    }

    div.textContent = text;
    frag.appendChild(div);
  });

  consoleOutput.innerHTML = '';
  consoleOutput.appendChild(frag);
  consoleOutput.scrollTop = consoleOutput.scrollHeight;
}
