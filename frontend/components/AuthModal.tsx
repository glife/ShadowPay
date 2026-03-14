'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Shield, Wallet, Fingerprint, Hexagon } from 'lucide-react';
import { BrowserProvider } from 'ethers';

declare global {
  interface Window {
    ethereum?: any;
  }
}

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnect: (walletName: string) => void;
}

export const AuthModal = ({ isOpen, onClose, onConnect }: AuthModalProps) => {
  const [connectingTo, setConnectingTo] = useState<string | null>(null);

  const handleConnect = async (walletName: string) => {
    try {
      setConnectingTo(walletName);

      // Check if window.ethereum is available
      if (!window.ethereum) {
         alert('No Web3 wallet detected. Please install MetaMask or Brave Wallet.');
         setConnectingTo(null);
         return;
      }

      // 1. Connect and get the address
      const provider = new BrowserProvider(window.ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      const address = accounts[0];

      // 2. Fetch the nonce from our backend
      const nonceRes = await fetch(`/api/auth/nonce?address=${address}`);
      const nonceData = await nonceRes.json();
      
      if (!nonceData.nonce) {
         throw new Error('Failed to fetch nonce');
      }

      // 3. Construct the message to sign
      const message = `Welcome to ELSA_OS.\n\nPlease sign this message to establish your cypherpunk identity and secure your session.\n\nAddress: ${address}\nNonce: ${nonceData.nonce}`;

      // 4. Sign the message
      const signer = await provider.getSigner();
      const signature = await signer.signMessage(message);

      // 5. Verify the signature on the backend
      const verifyRes = await fetch('/api/auth/verify', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ message, signature, address })
      });

      const verifyData = await verifyRes.json();

      if (verifyData.success) {
         onConnect(walletName);
         onClose();
      } else {
         alert('Authentication failed: ' + verifyData.error);
         setConnectingTo(null);
      }

    } catch (error) {
      console.error('Wallet connection error:', error);
      alert('Connection rejected or failed. Please try again.');
      setConnectingTo(null);
    }
  };

  const providers = [
    { name: 'MetaMask', icon: <Wallet size={20}/>, type: 'Browser Extension', color: 'hover:border-[#F6851B]' },
    { name: 'Brave Wallet', icon: <Shield size={20}/>, type: 'Native Browser', color: 'hover:border-[#FB542B]' },
    { name: 'WalletConnect', icon: <Hexagon size={20}/>, type: 'Mobile Link', color: 'hover:border-[#3B99FC]' },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
        >
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-md"
            onClick={onClose}
          />
          
          {/* Modal Body */}
          <motion.div
            initial={{ scale: 0.95, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 20 }}
            className="relative w-full max-w-md glass-panel p-1 rounded-2xl overflow-hidden shadow-[0_0_50px_rgba(98,126,234,0.15)]"
          >
            {/* Cyberpunk Circuit Background pattern */}
            <div className="absolute inset-0 z-0 opacity-[0.03] pointer-events-none" 
                 style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)' }} />
            
            <div className="relative z-10 bg-[#050507]/90 rounded-xl p-6 sm:p-8 flex flex-col items-center border border-white/5">
              
              <button 
                onClick={onClose}
                className="absolute top-4 right-4 text-[#a3a3a3] hover:text-white transition-colors"
              >
                <X size={20} />
              </button>

              <div className="w-16 h-16 rounded-full bg-holographic mb-6 flex items-center justify-center text-white shadow-[0_0_20px_rgba(98,126,234,0.3)]">
                <Fingerprint size={32} />
              </div>

              <h2 className="text-2xl font-bold tracking-tight text-[#ededed] mb-1">
                Establish Identity
              </h2>
              <p className="text-sm font-mono text-[#a3a3a3] mb-8 uppercase tracking-widest bg-white/5 px-3 py-1 rounded">
                Web3 RPC Connection
              </p>

              <div className="w-full space-y-3">
                {providers.map((provider) => (
                  <button
                    key={provider.name}
                    onClick={() => handleConnect(provider.name)}
                    disabled={connectingTo !== null}
                    className={`
                      w-full flex items-center justify-between p-4 rounded-xl border border-white/10 
                      bg-white/[0.02] transition-all duration-300 group
                      ${connectingTo === provider.name ? 'border-[#627EEA] bg-[#627EEA]/10' : provider.color}
                      ${connectingTo && connectingTo !== provider.name ? 'opacity-40 cursor-not-allowed' : ''}
                    `}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`
                        p-2 rounded-lg bg-black/40 text-[#a3a3a3] group-hover:text-white transition-colors
                        ${connectingTo === provider.name ? 'text-[#627EEA]' : ''}
                      `}>
                        {provider.icon}
                      </div>
                      <div className="flex flex-col items-start">
                        <span className="font-bold text-[#ededed] group-hover:text-white">{provider.name}</span>
                        <span className="text-[10px] font-mono text-[#a3a3a3] uppercase">{provider.type}</span>
                      </div>
                    </div>
                    
                    {connectingTo === provider.name ? (
                      <div className="px-3 py-1 rounded bg-[#627EEA]/20 border border-[#627EEA]/50">
                        <span className="text-[10px] font-mono text-[#627EEA] animate-pulse">CONNECTING...</span>
                      </div>
                    ) : (
                      <div className="w-2 h-2 rounded-full bg-white/10 group-hover:bg-white/40 transition-colors" />
                    )}
                  </button>
                ))}
              </div>

              <div className="mt-8 text-center text-xs text-[#a3a3a3] font-mono border-t border-white/10 pt-6 w-full">
                <p>BY CONNECTING, YOU AGREE TO THE PROTOCOL&apos;S</p>
                <p className="text-[#627EEA]">ZERO-KNOWLEDGE TERMS</p>
              </div>
            </div>

          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
