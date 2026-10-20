/* Jewel Dress: optional Starknet layer.
 * - Connect with Cartridge (StarkZap SDK: social / passkey login, sponsored fees when available)
 *   or a browser extension wallet (Ready, Braavos… via get-starknet-core).
 * - Mint a finished dress as an ERC-721 (contract `JewelDress`, see contracts/).
 * - The 🤖 button copies a ready-made `starknet_invoke_contract` call for the starknet-agentic MCP server.
 * Both vendor bundles are local files and load only when the player presses Connect:
 * offline / no-wallet play makes no network requests at all. */
(function () {
  'use strict';
  const C = Object.assign({}, window.JD_STARKNET_CONFIG || {}, window.JD_STARKNET_CONFIG_OVERRIDE || {});
  const GAME = window.JD_GAME;
  if (!C.enabled || !GAME) return;
  const SEL = window.JD_SELECTORS || {};
  const KEY = 'jewel-dress-chain-v1';
  const configured = /^0x[0-9a-fA-F]{1,64}$/.test(C.contractAddress || '');
  const cartridgeOn = !!(C.cartridge && C.cartridge.enabled !== false);
  const feeMode = (C.cartridge && C.cartridge.feeMode) || { type: 'paymaster' };
  let wallet = null, kind = null, address = null, chainOk = true, busy = false, feeFallbackUsed = false;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const short = a => a ? a.slice(0, 6) + '…' + a.slice(-4) : '';

  // ---------- lazy vendor loaders ----------
  const loaders = {};
  function load(src, globalName) {
    if (window[globalName]) return Promise.resolve(window[globalName]);
    if (loaders[src]) return loaders[src];
    loaders[src] = new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = src;
      s.onload = () => window[globalName] ? res(window[globalName]) : rej(new Error('wallet library failed to load'));
      s.onerror = () => { delete loaders[src]; rej(new Error('wallet library failed to load (are you offline?)')); };
      document.head.appendChild(s);
    });
    return loaders[src];
  }
  const gsn = () => load('js/vendor/get-starknet-core.js', 'JD_GSN').then(m => m.getStarknet());
  const starkzap = () => load('js/vendor/starkzap.js', 'JD_STARKZAP');

  // ---------- read-only JSON-RPC ----------
  async function rpc(method, params) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 8000);
    try {
      const r = await fetch(C.rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: ctl.signal });
      const j = await r.json(); if (j.error) throw new Error(j.error.message || 'RPC error'); return j.result;
    } finally { clearTimeout(t); }
  }
  async function tokenOfDesign(hash) {
    if (!configured || !SEL.token_of_design) return null;
    const res = await rpc('starknet_call', { request: { contract_address: C.contractAddress, entry_point_selector: SEL.token_of_design, calldata: [hash] }, block_id: 'latest' });
    return BigInt(res[0]) + (BigInt(res[1] || 0) << 128n); // u256 = (low, high)
  }

  function classify(e) {
    const m = String((e && (e.message || e)) || '').toLowerCase();
    if (/reject|cancel|denied|abort|refused|closed/.test(m)) return 'You cancelled in the wallet. Nothing was sent.';
    if (/already minted/.test(m)) return 'This exact design is already on Starknet.';
    if (/popup/.test(m)) return 'Please allow pop-ups for this page to sign in with Cartridge.';
    if (/fetch|network|offline|failed to load|timeout/.test(m)) return 'Network problem: check your connection and try again.';
    if (/paymaster|sponsor|snip-9|outside execution/.test(m)) return 'Free minting is not available right now.';
    return 'Starknet error: ' + String((e && e.message) || e).slice(0, 160);
  }

  // ---------- panel ----------
  function panelHTML() {
    const head = `<h2 style="font-size:32px;color:var(--plum)">✦ Starknet atelier</h2>
      <p class="small muted">Optional. Mint your finished dresses as collectibles on <b>${esc(C.networkName)}</b> (a test network, no real money). The game never needs a wallet.</p>`;
    const contract = configured
      ? `<p class="small">Contract: <a href="${C.explorerContract}${C.contractAddress}" target="_blank" rel="noopener">${short(C.contractAddress)}</a></p>`
      : `<p class="small" style="background:#fff4e0;border:1px solid #ecd3a5;border-radius:10px;padding:8px 10px">The Jewel Dress contract is <b>not deployed yet</b>, so minting is off. You can still connect. (Owner: see <code>contracts/README.md</code>, then set <code>contractAddress</code> in <code>js/starknet-config.js</code>.)</p>`;
    if (address) return `<div style="padding:26px 24px">${head}<p>Connected${kind === 'cartridge' ? ' with Cartridge' : ''}: <b>${short(address)}</b>${chainOk ? '' : ' <span class="badge" style="background:#b04a4a">wrong network</span>'}</p>${contract}
      <p class="small muted">Mint a dress from your <b>Gallery</b> (✦ Mint) or from the designer.</p>
      <div class="tools"><button class="btn small" id="snGallery">🖼️ Gallery</button><button class="btn small" id="snOff">Disconnect</button></div></div>`;
    return `<div style="padding:26px 24px">${head}${contract}
      <div class="tools" style="flex-direction:column;align-items:stretch">
        ${cartridgeOn ? '<button class="btn primary" id="snCart">Play with Cartridge · passkey or social login</button>' : ''}
        <div id="snExt" class="tools" style="margin:0"><span class="small muted">Looking for browser wallets…</span></div></div>
      <p class="small muted" id="snStatus"></p>
      <p class="small muted">Cartridge sign-in uses the StarkZap SDK. Its session can only call <code>mint_dress</code> on the Jewel Dress contract.</p></div>`;
  }
  let pm = null;
  function openPanel() {
    const root = document.getElementById('modalRoot');
    root.innerHTML = `<div class="modal"><div class="sheet" style="max-width:520px"><button class="iconbtn close" aria-label="Close">✕</button><div id="snBody">${panelHTML()}</div></div></div>`;
    pm = root.firstChild;
    pm.addEventListener('click', e => { if (e.target === pm || e.target.closest('.close')) { root.innerHTML = ''; pm = null; } });
    bindPanel();
  }
  function rerender() { if (pm && pm.isConnected) { pm.querySelector('#snBody').innerHTML = panelHTML(); bindPanel(); } }
  function status(t) { const s = pm && pm.querySelector('#snStatus'); if (s) s.textContent = t; }
  function bindPanel() {
    const $ = s => pm.querySelector(s);
    if ($('#snCart')) $('#snCart').onclick = () => connectCartridge().then(rerender);
    if ($('#snOff')) $('#snOff').onclick = async () => { try { if (wallet && wallet.disconnect) await wallet.disconnect(); } catch (e) { /* ignore */ } wallet = null; address = null; kind = null; rerender(); };
    if ($('#snGallery')) $('#snGallery').onclick = () => GAME.go('gallery');
    const ext = $('#snExt');
    if (ext) gsn().then(g => g.getAvailableWallets()).then(list => {
      if (!pm || !pm.isConnected) return;
      ext.innerHTML = list && list.length
        ? list.map((w, i) => `<button class="btn small" data-ext="${i}">${esc(/argent|ready/i.test(String(w.id) + w.name) ? 'Ready' : w.name)}</button>`).join('')
        : `<span class="small muted">No browser wallet found. Install ${C.installLinks.map(l => `<a href="${l.url}" target="_blank" rel="noopener">${esc(l.name)}</a>`).join(' or ')}.</span>`;
      ext.querySelectorAll('[data-ext]').forEach(b => b.onclick = () => connectExtension(list[+b.dataset.ext]).then(rerender));
    }).catch(e => { ext.innerHTML = `<span class="small muted">${esc(classify(e))}</span>`; });
  }

  // ---------- connect ----------
  async function connectCartridge() {
    try {
      status('Loading Cartridge…');
      const SZ = await starkzap();
      const policies = configured ? (C.cartridge.methods || ['mint_dress']).map(m => ({ target: C.contractAddress, method: m })) : [];
      const labels = { CONNECTING: 'Sign in…', CHECK_DEPLOYED: 'Checking your account…', DEPLOYING: 'Setting up your account…', READY: 'Ready ✦' };
      wallet = await SZ.connect({ network: C.network, rpcUrl: C.rpcUrl, policies, feeMode, deploy: C.cartridge.deploy || 'if_needed',
        ...(C.cartridge.preset ? { preset: C.cartridge.preset } : {}), onProgress: s => status(labels[s] || s || '') });
      kind = 'cartridge'; address = wallet.address; chainOk = true;
      GAME.toast('Connected with Cartridge ✦');
      return true;
    } catch (e) { console.warn(e); status(classify(e)); GAME.toast(classify(e)); return false; }
  }
  async function connectExtension(w) {
    try {
      const g = await gsn(); const sw = await g.enable(w);
      const accts = await sw.request({ type: 'wallet_requestAccounts', params: {} });
      address = accts && accts[0]; if (!address) throw new Error('No account');
      let chainId = null; try { chainId = await sw.request({ type: 'wallet_requestChainId' }); } catch (e) { /* older wallets */ }
      chainOk = !chainId || String(chainId).toLowerCase() === C.chainId.toLowerCase();
      if (!chainOk) { try { await sw.request({ type: 'wallet_switchStarknetChain', params: { chainId: C.chainId } }); chainOk = true; } catch (e) { /* user said no */ } }
      wallet = sw; kind = 'extension';
      GAME.toast('Wallet connected ✦');
      return true;
    } catch (e) { console.warn(e); GAME.toast(classify(e)); return false; }
  }

  // ---------- mint ----------
  async function callsFor(d) {
    const hash = await GAME.fingerprint(d);
    const calldata = [hash, GAME.nameFelt(d.name), GAME.gemMask(d), '0x' + Math.min(d.gems.length, 1000).toString(16)];
    return { hash, calldata, call: { contractAddress: C.contractAddress, entrypoint: 'mint_dress', calldata } };
  }
  async function executeCartridge(call, mode) {
    const pre = await wallet.preflight({ calls: [call], feeMode: mode });
    if (pre && pre.ok === false) throw new Error(pre.reason || 'The transaction would fail');
    return wallet.execute([call], { feeMode: mode });
  }
  async function mint(d) {
    if (!configured) { GAME.toast('Minting is off: the Jewel Dress contract is not deployed yet.', 4200); return; }
    if (busy) return;
    if (!d.gems || !d.gems.length) { GAME.toast('Set some gems first ✨'); return; }
    if (d.minted) { GAME.toast('This dress is already on Starknet ✦'); return; }
    if (!wallet) { openPanel(); GAME.toast('Connect a wallet first ✦'); return; }
    if (!chainOk) { GAME.toast('Please switch your wallet to ' + C.networkName); return; }
    busy = true;
    try {
      const { hash, call } = await callsFor(d);
      const existing = await tokenOfDesign(hash).catch(() => null);
      if (existing && existing > 0n) { GAME.markMinted(d.id, { token: existing.toString(), url: C.explorerNft + C.contractAddress + '/' + existing }); GAME.toast('This exact design is already minted (#' + existing + ')'); return; }
      GAME.toast(kind === 'cartridge' ? 'Minting with Cartridge… ✦' : 'Check your wallet to approve ✦', 6000);
      let txHash;
      if (kind === 'cartridge') {
        let tx;
        try { tx = await executeCartridge(call, feeFallbackUsed ? C.cartridge.fallbackFeeMode : feeMode); }
        catch (e) {
          if (!feeFallbackUsed && /paymaster|sponsor|snip-9|outside execution/i.test(String(e && e.message))) {
            feeFallbackUsed = true; GAME.toast('Free minting is not available right now; your wallet pays the small test fee.');
            tx = await executeCartridge(call, C.cartridge.fallbackFeeMode || 'user_pays');
          } else throw e;
        }
        txHash = tx.hash; await tx.wait();
      } else {
        const res = await wallet.request({ type: 'wallet_addInvokeTransaction', params: { calls: [{ contract_address: call.contractAddress, entry_point: call.entrypoint, calldata: call.calldata }] } });
        txHash = res && (res.transaction_hash || res.transactionHash);
      }
      const token = await tokenOfDesign(hash).catch(() => null);
      GAME.markMinted(d.id, { tx: txHash, token: token ? token.toString() : null, url: token ? C.explorerNft + C.contractAddress + '/' + token : C.explorerTx + txHash });
      GAME.toast('Minted on Starknet ✦', 3500);
    } catch (e) { console.warn(e); GAME.toast(classify(e), 4200); }
    finally { busy = false; }
  }

  // ---------- AI agent hook (starknet-agentic MCP server) ----------
  async function agentCall(d) {
    const { calldata } = await callsFor(d);
    const payload = { tool: 'starknet_invoke_contract', arguments: { contractAddress: configured ? C.contractAddress : '<JEWEL_DRESS_CONTRACT_ADDRESS>', entrypoint: 'mint_dress', calldata } };
    const txt = JSON.stringify(payload, null, 2);
    const root = document.getElementById('modalRoot');
    root.innerHTML = `<div class="modal"><div class="sheet" style="max-width:560px;padding:24px"><button class="iconbtn close" aria-label="Close">✕</button><h3 style="font-size:26px;color:var(--plum)">🤖 Agent tool call</h3>
      <p class="small muted">An AI agent running the <b>starknet-agentic</b> MCP server can mint this dress with its own Starknet account using this call (see <code>agent/README.md</code>).</p>
      <pre style="white-space:pre-wrap;word-break:break-all;font-size:12px;background:#f6efe7;padding:12px;border-radius:10px">${esc(txt)}</pre><button class="btn small" id="cpAgent">Copy</button></div></div>`;
    root.firstChild.addEventListener('click', ev => { if (ev.target === root.firstChild || ev.target.closest('.close')) root.innerHTML = ''; });
    root.querySelector('#cpAgent').onclick = () => navigator.clipboard.writeText(txt).then(() => GAME.toast('Copied 🤖'), () => GAME.toast('Select the text to copy it'));
    return payload;
  }

  window.JD_STARKNET = { enabled: true, configured, openPanel, mint, agentCall, callsFor, get address() { return address; }, get kind() { return kind; } };
  if (GAME.refresh) GAME.refresh();
})();
