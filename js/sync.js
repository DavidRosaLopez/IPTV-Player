const Sync = (() => {
  let peer = null;
  let pin = '';
  let qrCode = null;
  let initialized = false;

  function init(onConfigReceived) {
    if (initialized) return;
    initialized = true;

    // Generate random 4-digit PIN for easier typing
    pin = Math.floor(1000 + Math.random() * 9000).toString();
    const peerId = 'iptv-tv-' + pin;

    const codeEl = document.getElementById('sync-code');
    const statusEl = document.getElementById('sync-status');
    const qrContainer = document.getElementById('qrcode-container');

    if (codeEl) codeEl.textContent = pin;
    if (statusEl) statusEl.textContent = 'Conectando al servidor P2P...';

    // Placeholder URL for the remote control web. 
    // You should replace this with your actual hosted URL (e.g. Vercel/Netlify)
    const remoteUrl = window.location.origin.includes('localhost') 
      ? `http://${window.location.hostname}:3000/web-remote/?pin=${pin}` 
      : `https://my-iptv-remote.vercel.app/?pin=${pin}`;

    // Generate QR Code
    if (qrContainer && typeof QRCode !== 'undefined') {
      qrContainer.innerHTML = '';
      qrCode = new QRCode(qrContainer, {
        text: remoteUrl,
        width: 150,
        height: 150,
        colorDark : "#000000",
        colorLight : "#ffffff",
        correctLevel : QRCode.CorrectLevel.H
      });
    }

    try {
      peer = new Peer(peerId, { debug: 1 });

      peer.on('open', (id) => {
        if (statusEl) {
          statusEl.textContent = '✅ Listo. Escanea el QR para configurar.';
          statusEl.style.color = 'var(--success)';
        }
      });

      peer.on('connection', (conn) => {
        if (statusEl) statusEl.textContent = 'Móvil conectado...';
        
        conn.on('data', (data) => {
          if (data && data.type === 'new_list') {
            if (statusEl) statusEl.textContent = '¡Configuración recibida!';
            if (onConfigReceived) {
              // Add a small delay for UI effect
              setTimeout(() => {
                onConfigReceived(data.list);
              }, 500);
            }
          }
        });

        conn.on('close', () => {
          if (statusEl) statusEl.textContent = '✅ Listo. Escanea el QR para configurar.';
        });
      });

      peer.on('error', (err) => {
        console.error('PeerJS Error:', err);
        if (statusEl) {
          statusEl.textContent = '❌ Error de red: ' + err.type;
          statusEl.style.color = 'var(--error)';
        }
      });
    } catch(e) {
      if (statusEl) {
        statusEl.textContent = '❌ Error inicializando PeerJS';
        statusEl.style.color = 'var(--error)';
      }
    }
  }

  return { init };
})();
