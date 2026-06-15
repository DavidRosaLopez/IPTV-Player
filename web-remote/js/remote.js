const Remote = (() => {
  let peer = null;
  let conn = null;
  let listType = 'm3u';
  let toastTimer = null;

  function init() {
    // Check if PIN is in URL params (e.g. scanned from QR)
    const params = new URLSearchParams(window.location.search);
    const pinParam = params.get('pin');
    if (pinParam && pinParam.length === 4) {
      document.getElementById('pin-input').value = pinParam;
      _connectToTV(pinParam);
    }

    // Connect button
    document.getElementById('btn-connect').addEventListener('click', () => {
      const pin = document.getElementById('pin-input').value;
      if (pin.length === 4) _connectToTV(pin);
      else _showError('El PIN debe tener 4 dígitos');
    });

    // Auto-connect when typing 4 digits
    document.getElementById('pin-input').addEventListener('input', (e) => {
      if (e.target.value.length === 4) {
        _connectToTV(e.target.value);
      }
    });

    // Tabs
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        listType = e.target.dataset.type;
        document.getElementById('fields-m3u').classList.toggle('hidden', listType !== 'm3u');
        document.getElementById('fields-xtream').classList.toggle('hidden', listType !== 'xtream');
      });
    });

    // Form submit
    document.getElementById('form-list').addEventListener('submit', (e) => {
      e.preventDefault();
      _sendListToTV();
    });

    // Restore last configuration
    const lastConfig = localStorage.getItem('iptv_remote_config');
    if (lastConfig) {
      try {
        const data = JSON.parse(lastConfig);
        document.getElementById('list-name').value = data.name || '';
        if (data.type === 'm3u') {
          document.getElementById('m3u-url').value = data.url || '';
          document.getElementById('m3u-epg').value = data.epgUrl || '';
          document.querySelector('[data-type="m3u"]').click();
        } else {
          document.getElementById('xt-server').value = data.server || '';
          document.getElementById('xt-user').value = data.user || '';
          document.getElementById('xt-pass').value = data.pass || '';
          document.querySelector('[data-type="xtream"]').click();
        }
      } catch(e) {}
    }
  }

  function _connectToTV(pin) {
    const errorEl = document.getElementById('connect-error');
    errorEl.classList.add('hidden');
    const btn = document.getElementById('btn-connect').querySelector('span');
    btn.textContent = 'Conectando...';

    // Initialize peer
    if (peer) peer.destroy();
    peer = new Peer({ debug: 1 });

    peer.on('open', () => {
      const peerId = 'iptv-tv-' + pin;
      conn = peer.connect(peerId, { reliable: true });

      conn.on('open', () => {
        _onConnected();
      });

      conn.on('error', (err) => {
        _showError('Error de conexión.');
        btn.textContent = 'Vincular Televisor';
      });

      // Handle connection failure if the remote peer isn't found
      setTimeout(() => {
        if (!conn.open) {
          _showError('No se encuentra la TV. Revisa el PIN.');
          btn.textContent = 'Vincular Televisor';
          peer.destroy();
        }
      }, 5000);
    });

    peer.on('error', (err) => {
      _showError('Error en servidor P2P.');
      btn.textContent = 'Vincular Televisor';
    });
  }

  function _onConnected() {
    const badge = document.getElementById('conn-badge');
    badge.textContent = 'Conectado a TV';
    badge.classList.add('connected');
    
    document.getElementById('view-connect').classList.remove('active');
    document.getElementById('view-dashboard').classList.add('active');
    _showToast('¡Vinculado correctamente!');
  }

  function _sendListToTV() {
    if (!conn || !conn.open) {
      _showToast('Error: No hay conexión con la TV', 'error');
      return;
    }

    const name = document.getElementById('list-name').value;
    let listData = { name, type: listType };

    if (listType === 'm3u') {
      listData.url = document.getElementById('m3u-url').value;
      listData.epgUrl = document.getElementById('m3u-epg').value;
    } else {
      listData.server = document.getElementById('xt-server').value;
      listData.user = document.getElementById('xt-user').value;
      listData.pass = document.getElementById('xt-pass').value;
    }

    const payload = {
      type: 'new_list',
      list: listData
    };

    // Save to local storage so it persists on reload
    localStorage.setItem('iptv_remote_config', JSON.stringify(listData));

    conn.send(payload);
    _showToast('✅ Enviado a la TV');
  }

  function _showError(msg) {
    const el = document.getElementById('connect-error');
    el.textContent = msg;
    el.classList.remove('hidden');
  }

  function _showToast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), 3000);
  }

  return { init };
})();

window.addEventListener('load', Remote.init);
