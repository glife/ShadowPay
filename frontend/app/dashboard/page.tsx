'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { ConsensusOrb } from '@/components/ConsensusOrb';
import { BlueprintTerminal } from '@/components/BlueprintTerminal';
import { ActivitySquare, Fingerprint, Network, Brain } from 'lucide-react';

export default function DashboardPage() {
  
  const models = [
    {
      name: "GEMINI",
      role: "Deep Research & Fact-Checking",
      color: "from-[#8A2BE2]/20 to-transparent",
      borderColor: "border-[#8A2BE2]/50",
      textColor: "text-[#8A2BE2]",
      logs: [
        "> Scraping web history for SOL trends...",
        "> Cross-referencing top 50 DEX volumes.",
        "> Found strong historical correlation with BTC dominance.",
        "> VERIFIED: No recent major exploits in target protocol."
      ]
    },
    {
      name: "GPT",
      role: "Strategic Planning",
      color: "from-[#00A67E]/20 to-transparent",
      borderColor: "border-[#00A67E]/50",
      textColor: "text-[#00A67E]",
      logs: [
        "> Analyzing user intent: LONG_POSITION.",
        "> Calculating optimal leverage: 2x recommended.",
        "> Setting take-profit target at +15%.",
        "> Preparing smart contract execution path."
      ]
    },
    {
      name: "CLAUDE",
      role: "Security Audit",
      color: "from-[#D97757]/20 to-transparent",
      borderColor: "border-[#D97757]/50",
      textColor: "text-[#D97757]",
      logs: [
        "> Ingesting top 3 DEX provider smart contracts...",
        "> Scanning for re-entrancy vulnerabilities [CLEAN].",
        "> Auditing liquidity pool depth [SUFFICIENT].",
        "> SEC_STATUS: GREEN. Transaction safe to broadcast."
      ]
    },
    {
      name: "GROK",
      role: "Real-time Sentiment",
      color: "from-[#FFFFFF]/20 to-transparent",
      borderColor: "border-white/50",
      textColor: "text-white",
      logs: [
        "> X-Firehose connected.",
        "> Analyzing 45,000 tweets from last hour.",
        "> Fear/Greed Index: 72 (Greed).",
        "> Alpha detected: High momentum from CT influencers.",
        "> CONFIRMED: Sentiment aligns with long strategy."
      ]
    }
  ];

  return (
    <div className="min-h-screen p-4 md:p-8 overflow-y-auto w-full custom-scrollbar">
      
      <header className="mb-10 flex flex-col md:flex-row md:items-end justify-between border-b border-[#ffffff10] pb-4 gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center text-[#ededed]">
            <ActivitySquare className="mr-3 text-[#627EEA]" /> Council Deliberation
          </h1>
          <p className="text-[#a3a3a3] text-sm font-mono mt-1">// TIER_2_CONSENSUS_ENGINE</p>
        </div>
        <div className="flex space-x-4 text-xs font-mono text-[#a3a3a3]">
           <span className="flex items-center gap-1"><Fingerprint size={12}/> MPC WALLET: LOCKED</span>
           <span className="flex items-center gap-1"><Network size={12}/> ELSA_BROKER_IDLE</span>
        </div>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 w-full max-w-[1400px] mx-auto">
         
         {/* Left Side: The 4 Models Thinking */}
         <div className="xl:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {models.map((model, idx) => (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: idx * 0.1 }}
                key={model.name} 
                className={`glass-panel border-t-2 ${model.borderColor} p-4 rounded-xl flex flex-col h-64`}
              >
                 <div className="flex justify-between items-center mb-3">
                    <span className={`font-bold font-mono text-sm ${model.textColor}`}>{model.name}</span>
                    <Brain size={14} className={model.textColor} />
                 </div>
                 <div className="text-[10px] text-[#a3a3a3] uppercase tracking-widest mb-4 border-b border-white/5 pb-2">
                    {model.role}
                 </div>
                 
                 <div className="flex-[1] overflow-y-auto custom-scrollbar font-mono text-xs space-y-2 text-[#d4d4d4]">
                    {model.logs.map((log, i) => (
                       <motion.div 
                         initial={{ opacity: 0, x: -10 }}
                         animate={{ opacity: 1, x: 0 }}
                         transition={{ delay: (idx * 0.5) + (i * 0.8) }}
                         key={i}
                       >
                         {log}
                       </motion.div>
                    ))}
                    <motion.div 
                      animate={{ opacity: [1, 0, 1] }} 
                      transition={{ repeat: Infinity, duration: 1 }}
                      className={`h-3 w-2 ${model.name === 'GROK' ? 'bg-white' : 'bg-current'} inline-block ${model.textColor} mt-2`}
                    />
                 </div>
              </motion.div>
            ))}
         </div>

         {/* Right Side: Orb & Final Output */}
         <div className="xl:col-span-5 flex flex-col items-center justify-center space-y-12 bg-black/40 rounded-2xl border border-white/5 p-8 relative overflow-hidden">
            {/* Background Glow */}
            <div className="absolute top-1/4 select-none pointer-events-none left-1/2 -translate-x-1/2 w-[300px] h-[300px] bg-[#627EEA]/10 rounded-full blur-[100px]" />
            
            <div className="text-center w-full z-10">
               <h3 className="text-[#ededed] font-bold text-lg mb-2 tracking-wide">Synthesizing Consensus</h3>
               <p className="text-[#a3a3a3] text-xs font-mono">Multimodal logic merging underway...</p>
            </div>
            
            <div className="z-10 scale-90">
               <ConsensusOrb />
            </div>

            <div className="w-full z-10 mt-auto">
               <h4 className="text-[10px] font-mono text-[#a3a3a3] uppercase tracking-widest mb-2 border-b border-white/10 pb-1">Generated Output Payload:</h4>
               <BlueprintTerminal />
            </div>
         </div>

      </div>
    </div>
  );
}
