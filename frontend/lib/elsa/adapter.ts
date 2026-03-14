'use client';

import { BrowserProvider } from 'ethers';

/**
 * Elsa Wallet Adapter
 * This follows the Elsa SDK pattern for establishing a message port 
 * between the wallet state and the execution broker.
 */
export const createWalletAdapter = async () => {
  if (typeof window !== 'undefined' && window.ethereum) {
    try {
      const provider = new BrowserProvider(window.ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      const address = accounts[0];
      const signer = await provider.getSigner();

      return {
        address,
        signer,
        provider,
        connected: true,
        // Mocking the 'messagePort' concept from the SDK for compatibility
        port: {
          postMessage: (msg: any) => console.log('ELSA_PORT_OUT:', msg),
          onmessage: null as any
        }
      };
    } catch (error) {
      console.error('FAILED_TO_INIT_ADAPTER:', error);
      return null;
    }
  }
  return null;
};
