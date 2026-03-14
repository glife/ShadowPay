'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, SquareTerminal, ActivitySquare, ShoppingCart, Hexagon, Fingerprint } from 'lucide-react';
import { motion } from 'framer-motion';
import { AuthModal } from './AuthModal';

export const Sidebar = () => {
  const pathname = usePathname();
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [connectedProvider, setConnectedProvider] = useState<string | null>(null);

  const links = [
    { name: 'Gateway', href: '/', icon: Home, label: 'Overview' },
    { name: 'Terminal', href: '/chat', icon: SquareTerminal, label: 'Chat Input' },
    { name: 'Council', href: '/dashboard', icon: ActivitySquare, label: 'Deliberation' },
    { name: 'Registry', href: '/marketplace', icon: ShoppingCart, label: 'Agents' },
  ];

  return (
    <nav className="w-16 lg:w-64 h-screen fixed left-0 top-0 border-r border-[#ffffff10] glass-panel bg-[#050507]/90 flex flex-col z-50">
      
      {/* Brand Header */}
      <div className="h-20 flex items-center justify-center lg:justify-start lg:px-6 border-b border-[#ffffff10]">
        <Hexagon className="text-[#627EEA] hidden lg:block mr-3" size={24} />
        <div className="flex flex-col items-center lg:items-start">
          <span className="text-white font-bold tracking-widest hidden lg:block">ELSA_OS</span>
          <span className="text-white font-bold lg:hidden">E</span>
          <span className="text-[9px] text-[#a3a3a3] font-mono hidden lg:block">v1.0.0-rc</span>
        </div>
      </div>

      {/* Nav Links */}
      <div className="flex-1 py-8 flex flex-col gap-4 px-3 lg:px-4">
        {links.map((link) => {
          const isActive = pathname === link.href;
          return (
            <Link 
              key={link.name} 
              href={link.href}
              className="relative group"
            >
              <div className={`
                flex flex-col lg:flex-row items-center lg:items-start gap-1 lg:gap-4 p-3 rounded-lg transition-all duration-300
                ${isActive ? 'bg-[#627EEA]/10 text-white' : 'text-[#a3a3a3] hover:bg-[#ffffff05] hover:text-[#ededed]'}
              `}>
                <link.icon 
                  size={20} 
                  className={`transition-colors duration-300 ${isActive ? 'text-[#627EEA]' : 'group-hover:text-white'}`} 
                />
                
                <div className="hidden lg:flex flex-col">
                  <span className="font-bold text-sm tracking-wide">{link.name}</span>
                  <span className="text-[10px] font-mono opacity-60 uppercase">{link.label}</span>
                </div>

                {/* Active Indicator Line */}
                {isActive && (
                  <motion.div 
                    layoutId="active-navIndicator"
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-[#627EEA] rounded-r-full shadow-[0_0_10px_#627EEA]"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  />
                )}
              </div>
            </Link>
          );
        })}
      </div>

      {/* Connection Status Footer */}
      <div className="p-4 border-t border-[#ffffff10] hidden lg:block">
        {connectedProvider ? (
          <div className="flex items-center gap-2 p-3 bg-black/40 rounded border border-[#627EEA]/30">
            <div className="w-2 h-2 rounded-full bg-[#00A67E] animate-pulse shadow-[0_0_8px_#00A67E]"></div>
            <div className="flex flex-col">
                <span className="text-[#00A67E] text-[10px] font-mono whitespace-nowrap overflow-hidden text-ellipsis">CONNECTED</span>
                <span className="text-[#a3a3a3] text-[9px] font-mono">{connectedProvider.toUpperCase()}</span>
            </div>
          </div>
        ) : (
          <button 
            onClick={() => setIsAuthOpen(true)}
            className="w-full relative group overflow-hidden rounded-lg p-[1px]"
          >
            <span className="absolute inset-0 bg-gradient-to-r from-[#627EEA] to-[#8A2BE2] opacity-50 group-hover:opacity-100 transition-opacity duration-300" />
            <div className="relative flex items-center justify-center gap-2 bg-[#050507] hover:bg-[#627EEA]/10 w-full h-full px-4 py-3 rounded-[7px] transition-colors duration-300">
               <Fingerprint size={16} className="text-[#627EEA] group-hover:text-white transition-colors" />
               <span className="text-sm font-bold tracking-widest text-[#ededed]">CONNECT</span>
            </div>
          </button>
        )}
      </div>

      <AuthModal 
        isOpen={isAuthOpen} 
        onClose={() => setIsAuthOpen(false)} 
        onConnect={(wallet) => setConnectedProvider(wallet)} 
      />
    </nav>
  );
};
