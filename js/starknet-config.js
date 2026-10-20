/*
 * Jewel Dress: Starknet settings (optional layer).
 * After deploying the contract (see contracts/README.md), paste its address into `contractAddress`.
 * While `contractAddress` is empty, players can still connect a wallet, but minting stays off.
 *
 * Cartridge (via StarkZap): social / passkey login, session policies limited to this game's
 * `mint_dress` entrypoint, and feeMode { type: "paymaster" } so mints are free where sponsorship
 * is configured. Extension wallets (Ready, Braavos) are available as an alternative.
 */
window.JD_STARKNET_CONFIG = {
  enabled: true,                              // set to false to hide every Starknet button
  network: 'sepolia',
  networkName: 'Sepolia testnet',
  chainId: '0x534e5f5345504f4c4941',          // SN_SEPOLIA
  rpcUrl: 'https://starknet-sepolia.drpc.org', // any Starknet JSON-RPC (v0.8+) endpoint for Sepolia
  contractAddress: '0x037207895b8f0396c276721f02478d5e573e2c3cb883c3ad93e091a2e496449f', // JewelDress on Sepolia (deployed 2026-10-20)
  explorerTx: 'https://sepolia.voyager.online/tx/',
  explorerContract: 'https://sepolia.voyager.online/contract/',
  explorerNft: 'https://sepolia.voyager.online/nft/',
  cartridge: {
    enabled: true,
    feeMode: { type: 'paymaster' },           // current StarkZap API ("sponsored" is a deprecated alias)
    fallbackFeeMode: 'user_pays',             // used once if paymaster sponsorship isn't available
    deploy: 'if_needed',
    methods: ['mint_dress'],                  // session policy: only this entrypoint
    // preset: 'jewel-dress',                 // optional Cartridge dashboard preset
  },
  installLinks: [
    { name: 'Ready', url: 'https://www.ready.co/' },
    { name: 'Braavos', url: 'https://braavos.app/' }
  ]
};
