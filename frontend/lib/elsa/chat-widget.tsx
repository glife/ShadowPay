'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, X, Send, Bot, Shield, Zap, Globe, Cpu } from 'lucide-react';

/**
 * HeyElsaChatWidget [Polyfill]
 * This component mirrors the official @heyelsa/chat-widget interface.
 */
export const HeyElsaChatWidget = ({ 
  keyId, 
  dappName, 
  messagePort,
  customStyles = {} 
}: { 
  keyId: string; 
  dappName: string; 
  messagePort?: any;
  customStyles?: any;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<{role: 'elsa' | 'user', content: string}[]>([
    { role: 'elsa', content: `Greetings. I am Elsa, the Middleware Broker for ${dappName}. How may I orchestrate your intent?` }
  ]);
  const [inputValue, setInputValue] = useState('');

  const handleSend = () => {
    if (!inputValue.trim()) return;
    setMessages([...messages, { role: 'user', content: inputValue }]);
    setInputValue('');
    
    // Simulate Elsa's response logic
    setTimeout(() => {
      setMessages(prev => [...prev, { 
        role: 'elsa', 
        content: "Understood. I'm cross-referencing your request with the AI Council's active blueprints..." 
      }]);
    }, 1000);
  };

  return (
    <div className="fixed bottom-6 right-6 z-[1000]" style={customStyles}>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.8 }}
            className="glass-panel w-[380px] h-[520px] mb-4 overflow-hidden flex flex-col shadow-2xl border-[#627EEA]/30"
          >
            {/* Header */}
            <div className="p-4 bg-gradient-to-r from-[#627EEA]/20 to-[#8A2BE2]/20 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#627EEA] flex items-center justify-center text-white shadow-[0_0_15px_rgba(98,126,234,0.5)]">
                  <Bot size={24} />
                </div>
                <div>
                  <h4 className="font-bold text-[#ededed] leading-none">ELSA_AI</h4>
                  <span className="text-[10px] text-[#00A67E] uppercase tracking-widest font-mono">Middleware Active</span>
                </div>
              </div>
              <button 
                onClick={() => setIsOpen(false)}
                className="text-[#a3a3a3] hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Message Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-black/20">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] p-3 rounded-2xl text-sm ${
                    msg.role === 'user' 
                      ? 'bg-[#627EEA] text-white shadow-lg' 
                      : 'bg-white/5 border border-white/10 text-[#ededed] font-mono'
                  }`}>
                    {msg.content}
                  </div>
                </div>
              ))}
            </div>

            {/* Features/Shortcuts */}
            <div className="p-3 border-t border-white/5 bg-black/40 flex gap-2 overflow-x-auto no-scrollbar">
               {[
                 { icon: Globe, label: "Bridge" },
                 { icon: Shield, label: "Custody" },
                 { icon: Zap, label: "Negotiate" }
               ].map(f => (
                 <button key={f.label} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/5 text-[10px] text-[#a3a3a3] hover:border-[#627EEA]/30 hover:text-[#627EEA] transition-all whitespace-nowrap">
                   <f.icon size={12} /> {f.label}
                 </button>
               ))}
            </div>

            {/* Input Area */}
            <div className="p-4 bg-black/40 border-t border-white/5">
              <div className="glass-panel flex items-center p-1 rounded-xl focus-within:border-[#627EEA]/50 transition-colors">
                <input 
                  type="text" 
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  placeholder="Ask Elsa to execute..."
                  className="flex-1 bg-transparent border-none outline-none text-[#ededed] p-2 text-sm placeholder:text-[#a3a3a3]/50"
                />
                <button 
                  onClick={handleSend}
                  className="p-2 text-[#627EEA] hover:text-white transition-colors"
                >
                  <Send size={18} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        className="w-16 h-16 rounded-full bg-[#627EEA] text-white flex items-center justify-center shadow-[0_0_30px_rgba(98,126,234,0.4)] relative border border-white/10 group overflow-hidden"
      >
        <div className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        <AnimatePresence mode="wait">
          {isOpen ? (
            <motion.div key="close" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }}>
              <X size={32} />
            </motion.div>
          ) : (
            <motion.div key="chat" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }}>
              <MessageSquare size={32} fill="white" />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>
    </div>
  );
};

export const syncWalletState = (state: any) => {
  console.log('ELSA_SYNC_WALLET:', state);
  return true;
};
