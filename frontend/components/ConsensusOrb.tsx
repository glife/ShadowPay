'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export const ConsensusOrb = () => {
  const [phase, setPhase] = useState<'thinking' | 'consensus'>('thinking');

  useEffect(() => {
    // Simulate thinking time before reaching consensus
    const timer = setTimeout(() => {
      setPhase('consensus');
    }, 4000); // 4 seconds of "thinking"
    
    // Simulate re-thinking for demo looping purposes
    const resetTimer = setInterval(() => {
       setPhase('thinking');
       setTimeout(() => setPhase('consensus'), 4000);
    }, 12000);

    return () => {
      clearTimeout(timer);
      clearInterval(resetTimer);
    };
  }, []);

  return (
    <div className="relative flex items-center justify-center w-64 h-64 mb-12">
      {/* Central Core */}
      <motion.div
        className="absolute w-12 h-12 rounded-full bg-holographic blur-md"
        animate={{
          scale: phase === 'thinking' ? [1, 1.2, 1] : 1.5,
          opacity: phase === 'thinking' ? [0.6, 1, 0.6] : 1,
        }}
        transition={{
          duration: phase === 'thinking' ? 2 : 1,
          repeat: phase === 'thinking' ? Infinity : 0,
          ease: "easeInOut"
        }}
      />
      
      {/* Inner Glowing Ethereum Diamond shape shown on consensus */}
      <motion.div
        className="absolute w-16 h-16 bg-[#627EEA] rotate-45"
        initial={{ opacity: 0, scale: 0 }}
        animate={{
          opacity: phase === 'consensus' ? 0.9 : 0,
          scale: phase === 'consensus' ? 1.2 : 0,
        }}
        transition={{ duration: 1, ease: "easeOut" }}
        style={{
          boxShadow: '0 0 40px rgba(98, 126, 234, 0.8)',
          clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' 
        }}
      />

      {/* Orbiting Points representing the 4 agents */}
      {['Gemini', 'GPT', 'Claude', 'Grok'].map((agent, index) => {
        const colors = ['#8A2BE2', '#00A67E', '#D97757', '#FFFFFF'];
        const offsets = [0, 90, 180, 270];
        
        return (
          <motion.div
            key={agent}
            className="absolute top-1/2 left-1/2 w-3 h-3 rounded-full"
            style={{ 
              backgroundColor: colors[index],
              boxShadow: `0 0 10px ${colors[index]}`
            }}
            initial={{ opacity: 1 }}
            animate={
              phase === 'thinking' 
                ? {
                    rotate: [offsets[index], offsets[index] + 360],
                    x: ['-50%', '-50%'],
                    y: ['-50%', '-50%'],
                    translateZ: 0, // Force GPU
                  }
                : {
                    rotate: offsets[index] + 360,
                    x: '-50%',
                    y: '-50%',
                    scale: 0,
                    opacity: 0,
                  }
            }
            transition={{
              rotate: { duration: 3, repeat: Infinity, ease: "linear" },
              scale: { duration: 0.8, ease: "easeIn" },
              opacity: { duration: 0.8, ease: "easeIn" }
            }}
            // Framer motion uses a little trick for complex circular orbiting around a common center
            // but for simplicity we wrap it in a rotating container.
          />
        );
      })}

      {/* Rotating Track for 'thinking' phase */}
      <motion.div 
         className="absolute w-48 h-48 border border-white/5 rounded-full"
         animate={{ rotate: 360 }}
         transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
      >
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 bg-[#8A2BE2] rounded-full shadow-[0_0_15px_#8A2BE2]" title="Gemini" />
        <div className="absolute top-1/2 right-0 translate-x-1/2 -translate-y-1/2 w-4 h-4 bg-[#00A67E] rounded-full shadow-[0_0_15px_#00A67E]" title="GPT" />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-4 h-4 bg-[#D97757] rounded-full shadow-[0_0_15px_#D97757]" title="Claude" />
        <div className="absolute top-1/2 left-0 -translate-x-1/2 -translate-y-1/2 w-4 h-4 bg-[#FFFFFF] rounded-full shadow-[0_0_15px_#FFFFFF]" title="Grok" />
      </motion.div>
      
      {/* Consensus Text Overlay */}
      <motion.div
         className="absolute -bottom-8 text-sm tracking-widest font-mono text-holographic"
         initial={{ opacity: 0 }}
         animate={{ opacity: phase === 'consensus' ? 1 : 0 }}
      >
        CONSENSUS_REACHED
      </motion.div>
    </div>
  );
};
