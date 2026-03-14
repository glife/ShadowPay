'use client';

import React from 'react';
import { motion, useMotionTemplate, useMotionValue } from 'framer-motion';
import { Star, Clock, Zap, CheckCircle2 } from 'lucide-react';

interface MarketplaceCardProps {
  name: string;
  rating: number;
  cost: string;
  speed: string;
  type: 'crypto' | 'web2';
  icon?: React.ReactNode;
  delay?: number;
}

export const MarketplaceCard: React.FC<MarketplaceCardProps> = ({
  name,
  rating,
  cost,
  speed,
  type,
  icon,
  delay = 0,
}) => {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  // Holographic border effect on hover
  function handleMouseMove({
    currentTarget,
    clientX,
    clientY,
  }: React.MouseEvent<HTMLDivElement>) {
    const { left, top } = currentTarget.getBoundingClientRect();
    mouseX.set(clientX - left);
    mouseY.set(clientY - top);
  }

  // Fallback icon if none provided
  const DefaultIcon = type === 'crypto' ? Zap : CheckCircle2;
  const isCrypto = type === 'crypto';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5 }}
      whileHover={{ scale: 1.02, rotateY: 2, rotateX: -2 }}
      onMouseMove={handleMouseMove}
      className="group relative glass-panel rounded-xl p-[1px] overflow-hidden w-full transition-transform perspective-1000"
      style={{
        transformStyle: 'preserve-3d',
      }}
    >
      {/* Dynamic Hover Border */}
      <motion.div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{
          background: useMotionTemplate`
            radial-gradient(
              300px circle at ${mouseX}px ${mouseY}px,
              ${isCrypto ? 'rgba(98, 126, 234, 0.4)' : 'rgba(243, 186, 47, 0.4)'},
              transparent 80%
            )
          `,
        }}
      />
      
      {/* Card Content Structure */}
      <div className="relative h-full bg-[#0a0a0a]/90 backdrop-blur-xl rounded-xl p-4 flex flex-col gap-3">
        {/* Verification Badge Header */}
        <div className="flex justify-between items-start">
          <div className={`p-2 rounded-lg ${isCrypto ? 'bg-[#627EEA]/10 text-[#627EEA]' : 'bg-[#F3BA2F]/10 text-[#F3BA2F]'}`}>
            {icon ? icon : <DefaultIcon size={20} />}
          </div>
          <div className="flex flex-col items-end">
             <span className="text-xs font-mono text-[#a3a3a3] opacity-0 group-hover:opacity-100 transition-opacity">
               0x{Math.random().toString(16).slice(2, 10)}... VERIFIED
             </span>
             <div className="flex items-center text-[#F3BA2F] mt-1 space-x-1">
               <Star size={14} fill="#F3BA2F" />
               <span className="font-bold text-sm">{rating.toFixed(1)}</span>
             </div>
          </div>
        </div>

        {/* Title */}
        <div>
          <h3 className="text-lg font-bold text-[#ededed] leading-tight">{name}</h3>
          <p className="text-xs text-[#a3a3a3] uppercase tracking-wider mt-1 font-mono">
            {type === 'crypto' ? 'On-Chain Agent' : 'Web2 Oracle Verified'}
          </p>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 gap-2 mt-auto pt-3 border-t border-white/10">
          <div className="flex items-center text-xs text-[#d4d4d4]">
            <span className="text-[#a3a3a3] mr-2">Cost:</span>
            <span className="font-mono bg-white/5 px-2 py-0.5 rounded">{cost}</span>
          </div>
          <div className="flex items-center justify-end text-xs text-[#d4d4d4]">
            <Clock size={12} className="text-[#a3a3a3] mr-1" />
            <span className="font-mono bg-white/5 px-2 py-0.5 rounded">{speed}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
