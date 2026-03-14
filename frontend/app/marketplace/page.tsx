'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ShoppingCart, Search, Filter, Star, Clock, ArrowRightLeft, FileText, Globe, Key, Shield, X, HelpCircle, Zap, CheckCircle2, Loader2 } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';

const agentRegistry = [
  { id: 1, name: "DEX Swap Bot", provider: "0x7F...3B92", rating: 4.9, cost: "3$", speed: "250ms", type: "CRYPTO", icon: ArrowRightLeft, successRate: "99.8%", volume: "$12M+" },
  { id: 2, name: "Newsletter Gen", provider: "Web2_Oracle_A", rating: 4.8, cost: "1.5$", speed: "2s", type: "WEB2", icon: FileText, successRate: "99.1%", volume: "84K Gen" },
  { id: 3, name: "Yield Farmer", provider: "0x2A...9C11", rating: 4.5, cost: "5$", speed: "Fast", type: "CRYPTO", icon: Globe, successRate: "94.2%", volume: "$2M+" },
  { id: 4, name: "Smart Audit Bot", provider: "CertiK_Node", rating: 4.9, cost: "15$", speed: "5s", type: "SECURITY", icon: Shield, successRate: "100%", volume: "1.2K Audits" },
  { id: 5, name: "Notion Sync Bot", provider: "Web2_Oracle_B", rating: 4.7, cost: "1$", speed: "1.5s", type: "WEB2", icon: FileText, successRate: "98.5%", volume: "400K Syncs" },
  { id: 6, name: "MPC Wallet Signer", provider: "BitGo_Node", rating: 5.0, cost: "0.5$", speed: "50ms", type: "SECURITY", icon: Key, successRate: "99.99%", volume: "Infinite" },
];

export default function MarketplacePage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("ALL");
  const [selectedAgent, setSelectedAgent] = useState<any>(null);
  const [negotiationStep, setNegotiationStep] = useState(0);

  const filteredAgents = agentRegistry.filter(agent => {
    const matchesSearch = agent.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === "ALL" || agent.type === filterType;
    return matchesSearch && matchesType;
  });

  const startNegotiation = (agent: any) => {
    setSelectedAgent(agent);
    setNegotiationStep(1);
    
    // Auto-progress through negotiation steps
    setTimeout(() => setNegotiationStep(2), 1500);
    setTimeout(() => setNegotiationStep(3), 3000);
    setTimeout(() => setNegotiationStep(4), 4500);
  };

  return (
    <div className="min-h-screen p-4 md:p-8 w-full max-w-[1400px] mx-auto">
      
      <header className="mb-8 flex flex-col md:flex-row md:items-end justify-between border-b border-[#ffffff10] pb-4 gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center text-[#ededed]">
            <ShoppingCart className="mr-3 text-[#627EEA]" /> Smart Contract Hub
          </h1>
          <p className="text-[#a3a3a3] text-sm font-mono mt-1">// TIER_4_AGENT_MARKETPLACE</p>
        </div>
        <div className="flex space-x-4 text-xs font-mono">
           <span className="px-3 py-1 bg-[#F3BA2F]/10 text-[#F3BA2F] rounded-md border border-[#F3BA2F]/30 flex items-center gap-2">
             <Star size={12} /> REPUTATION_ENGINE_ACTIVE
           </span>
        </div>
      </header>

      {/* Search and Filters */}
      <div className="flex flex-col md:flex-row gap-4 mb-8">
         <div className="glass-panel flex-1 flex items-center p-3 rounded-xl">
           <Search size={18} className="text-[#a3a3a3] ml-2 mr-3" />
           <input 
             type="text" 
             placeholder="Search provider agents by name or hex address..."
             className="bg-transparent border-none outline-none text-[#ededed] w-full text-sm font-mono placeholder:text-[#a3a3a3]/50"
             value={searchTerm}
             onChange={(e) => setSearchTerm(e.target.value)}
           />
         </div>
         <div className="glass-panel flex items-center p-1 rounded-xl gap-1 overflow-x-auto custom-scrollbar whitespace-nowrap">
           <div className="px-3 text-[#a3a3a3]"><Filter size={16} /></div>
           {['ALL', 'CRYPTO', 'WEB2', 'SECURITY'].map(type => (
             <button
               key={type}
               onClick={() => setFilterType(type)}
               className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
                 filterType === type 
                   ? 'bg-[#627EEA] text-white' 
                   : 'text-[#a3a3a3] hover:bg-white/5'
               }`}
             >
               {type}
             </button>
           ))}
         </div>
      </div>

      {/* Registry Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
         {filteredAgents.map((agent, index) => (
           <motion.div
             initial={{ opacity: 0, scale: 0.95 }}
             animate={{ opacity: 1, scale: 1 }}
             transition={{ delay: index * 0.05 }}
             key={agent.id}
             className="glass-panel p-5 rounded-2xl flex flex-col hover:bg-white/5 hover:border-[#627EEA]/50 transition-colors group cursor-pointer"
           >
              <div className="flex justify-between items-start mb-4">
                 <div className={`p-3 rounded-xl ${
                   agent.type === 'CRYPTO' ? 'bg-[#627EEA]/20 text-[#627EEA]' : 
                   agent.type === 'WEB2' ? 'bg-[#F3BA2F]/20 text-[#F3BA2F]' : 
                   'bg-[#FF4F4F]/20 text-[#FF4F4F]'
                 }`}>
                   <agent.icon size={24} />
                 </div>
                 
                 <div className="flex flex-col items-end">
                    <div className="flex items-center text-[#F3BA2F] space-x-1 mb-1">
                      <Star size={16} fill="#F3BA2F" />
                      <span className="font-bold text-lg">{agent.rating.toFixed(1)}</span>
                    </div>
                    <span className="text-[10px] text-[#a3a3a3] uppercase tracking-wider">{agent.successRate} Success</span>
                 </div>
              </div>

              <div>
                 <h2 className="text-xl font-bold text-[#ededed]">{agent.name}</h2>
                 <p className="font-mono text-xs text-[#627EEA] mt-1">{agent.provider}</p>
              </div>

              <div className="mt-6 pt-4 border-t border-white/10 grid grid-cols-3 gap-2">
                 <div className="flex flex-col">
                   <span className="text-[10px] text-[#a3a3a3] uppercase mb-1">Cost</span>
                   <span className="text-sm font-mono text-[#ededed]">{agent.cost}</span>
                 </div>
                 <div className="flex flex-col">
                   <span className="text-[10px] text-[#a3a3a3] uppercase mb-1 flex items-center gap-1"><Clock size={10}/> Speed</span>
                   <span className="text-sm font-mono text-[#ededed]">{agent.speed}</span>
                 </div>
                 <div className="flex flex-col items-end">
                   <span className="text-[10px] text-[#a3a3a3] uppercase mb-1">Volume</span>
                   <span className="text-sm font-mono text-[#00A67E]">{agent.volume}</span>
                 </div>
              </div>

           </motion.div>
         ))}
      </div>

    </div>
  );
}
