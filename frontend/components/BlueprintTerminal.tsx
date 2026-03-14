'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, FileJson } from 'lucide-react';

interface BlueprintTerminalProps {
  payloadData?: string;
  isThinking?: boolean;
}

const defaultPayload = `{
  "action": "LONG_SOL",
  "asset": "SOL/USDC",
  "amount": "100",
  "strategy": "MOMENTUM_CONFIRMED",
  "constraints": {
    "maxSlippage": 0.05,
    "confidenceScore": 0.92,
    "minProviderRating": 4.5
  },
  "securityAudit": "PASSED"
}`;

export const BlueprintTerminal: React.FC<BlueprintTerminalProps> = ({ 
  payloadData = defaultPayload,
  isThinking = false
}) => {
  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const textRef = useRef('');

  useEffect(() => {
    if (isThinking) {
      setDisplayedText('// WAITING_FOR_COUNCIL_CONSENSUS...');
      return;
    }

    setDisplayedText('');
    textRef.current = '';
    setIsTyping(true);
    let i = 0;
    
    const typingInterval = setInterval(() => {
      if (i < payloadData.length) {
        textRef.current += payloadData.charAt(i);
        setDisplayedText(textRef.current);
        i++;
      } else {
        clearInterval(typingInterval);
        setIsTyping(false);
      }
    }, 15); // Adjust speed here

    return () => clearInterval(typingInterval);
  }, [payloadData, isThinking]);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-panel rounded-xl overflow-hidden w-full max-w-2xl font-mono text-xs sm:text-sm border-t-2 border-t-[#627EEA]/30 glow-effect"
    >
      {/* Terminal Header */}
      <div className="flex items-center justify-between bg-black/40 px-4 py-2 border-b border-white/10">
        <div className="flex items-center space-x-2 text-[#a3a3a3]">
          <FileJson size={14} />
          <span>// STRATEGIC_BLUEPRINT_v1.0.2</span>
        </div>
        <div className="flex items-center space-x-2">
          {!isThinking && !isTyping ? (
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              className="flex items-center text-[#00A67E] bg-[#00A67E]/10 px-2 py-0.5 rounded text-xs"
            >
              <ShieldCheck size={12} className="mr-1" />
              SIGNED_BY_ELSA
            </motion.div>
          ) : (
            <span className="text-[#F3BA2F] animate-pulse">PENDING</span>
          )}
        </div>
      </div>

      {/* Terminal Body */}
      <div className="p-4 bg-[#0a0a0a]/80 text-[#d4d4d4] min-h-[200px] overflow-x-auto relative">
        {/* Subtle grid lines background inside terminal */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:20px_20px] pointer-events-none" />
        
        <pre className="relative z-10 whitespace-pre-wrap">
          <code className={isThinking ? 'text-[#a3a3a3]' : 'text-[#627EEA]'}>
            {displayedText}
            {isTyping && <motion.span animate={{ opacity: [1, 0, 1] }} transition={{ repeat: Infinity, duration: 0.8 }} className="inline-block w-2 bg-[#627EEA] h-4 align-middle ml-1" /> }
          </code>
        </pre>
      </div>
    </motion.div>
  );
};
