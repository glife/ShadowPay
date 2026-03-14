'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Send, Terminal, Loader2, Database, Shield } from 'lucide-react';
import { createWalletAdapter } from '@/lib/elsa/adapter';
import { ElsaBroker } from '@/lib/elsa/broker';

interface ChatMessage {
  id: string;
  role: 'user' | 'system' | 'elsa';
  content: string;
  isJSON?: boolean;
  status?: 'interpreter' | 'negotiator' | 'custodian' | 'bridge' | 'success';
}

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'system',
      content: 'ELSA_OS GATEWAY ENCRYPTED. WAITING FOR USER INTENT.',
    }
  ]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isProcessing) return;

    const userPrompt = input;
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', content: userPrompt }]);
    setInput('');
    setIsProcessing(true);

    // 1. Council Thinking Phase
    setTimeout(async () => {
      const mockParsedIntent = {
        intent: "LONG_POSITION",
        asset: "SOL",
        amount_usd: 1000,
        condition: "HIGH_MOMENTUM",
        routing: "COUNCIL_REQUIRED"
      };

      setMessages(prev => [
        ...prev, 
        { 
          id: Date.now().toString(), 
          role: 'system', 
          content: 'NLU_PARSING_COMPLETE. GENERATING STRUCTURED PAYLOAD FOR COUNCIL...',
        },
        {
          id: (Date.now() + 1).toString(),
          role: 'system',
          content: JSON.stringify(mockParsedIntent, null, 2),
          isJSON: true
        }
      ]);

      await new Promise(r => setTimeout(r, 2000));

      // 2. Elsa Middleware Broker - Step 1: Interpreter
      const interpretation = await ElsaBroker.interpret(mockParsedIntent);
      setMessages(prev => [...prev, {
        id: (Date.now() + 2).toString(),
        role: 'elsa',
        status: 'interpreter',
        content: interpretation.log
      }]);

      await new Promise(r => setTimeout(r, 2000));

      // 3. Elsa Middleware Broker - Step 2: Negotiator
      const negotiation = await ElsaBroker.negotiate({});
      setMessages(prev => [...prev, {
        id: (Date.now() + 3).toString(),
        role: 'elsa',
        status: 'negotiator',
        content: negotiation.log
      }]);

      await new Promise(r => setTimeout(r, 2000));

      // 4. Elsa Middleware Broker - Step 3: Custodian
      const signatureResult = await ElsaBroker.sign("Jupiter");
      setMessages(prev => [...prev, {
        id: (Date.now() + 4).toString(),
        role: 'elsa',
        status: 'custodian',
        content: signatureResult.log
      }]);

      await new Promise(r => setTimeout(r, 2000));

      // 5. Elsa Middleware Broker - Step 4: Bridge
      const bridgeResult = await ElsaBroker.bridge({});
      setMessages(prev => [...prev, {
        id: (Date.now() + 5).toString(),
        role: 'elsa',
        status: 'bridge',
        content: bridgeResult.log
      }]);

      await new Promise(r => setTimeout(r, 2000));

      // 6. Success
      setMessages(prev => [...prev, {
        id: (Date.now() + 6).toString(),
        role: 'elsa',
        status: 'success',
        content: "ELSA_OS // TRANSACTION FINALIZED.\n> Payment released from Escrow.\n> Intent executed successfully. All markers green."
      }]);

      setIsProcessing(false);
    }, 1800);
  };

  return (
    <div className="h-screen flex flex-col pt-10 px-4 md:px-8 pb-4 relative overflow-hidden">
      
      {/* Cypherpunk Decorative Background Elements for Chat */}
      <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
         <Shield size={200} />
      </div>

      <header className="mb-6 flex justify-between items-end border-b border-[#ffffff10] pb-4 z-10">
        <div>
          <h1 className="text-2xl font-bold flex items-center text-[#ededed]">
            <Terminal className="mr-3 text-[#627EEA]" /> Gateway Terminal
          </h1>
          <p className="text-[#a3a3a3] text-sm font-mono mt-1">// INTENT_PARSING_MODULE_v2</p>
        </div>
        <div className="hidden sm:flex space-x-4 text-xs font-mono text-[#a3a3a3]">
           <span className="flex items-center gap-1"><Database size={12}/> DB_SYNC: OK</span>
        </div>
      </header>

      {/* Chat Messages Area */}
      <div className="flex-1 overflow-y-auto mb-4 pr-2 space-y-6 z-10 custom-scrollbar">
        {messages.map((msg) => (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div 
              className={`max-w-[85%] md:max-w-[70%] rounded-xl p-4 shadow-xl border ${
                msg.role === 'user' 
                  ? 'bg-[#627EEA]/10 border-[#627EEA]/30 text-[#ededed]' 
                  : 'glass-panel text-[#627EEA] font-mono whitespace-pre-wrap text-sm'
              }`}
            >
              {msg.role === 'system' && !msg.isJSON && (
                 <span className="block mb-2 text-[#00A67E] text-xs">&gt; SYSTEM:</span>
              )}
              {msg.isJSON ? (
                <div className="bg-black/60 p-3 rounded-lg border border-white/5 relative overflow-hidden">
                   <div className="absolute top-0 right-0 bg-[#F3BA2F] text-black text-[9px] px-2 py-0.5 rounded-bl-lg font-bold">JSON PAYLOAD</div>
                   <code>{msg.content}</code>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {msg.role === 'elsa' && (
                    <div className="flex items-center gap-2 mb-1">
                      <div className={`w-2 h-2 rounded-full animate-pulse ${msg.status === 'success' ? 'bg-[#00A67E]' : 'bg-[#627EEA]'}`} />
                      <span className={`text-[10px] font-mono tracking-widest ${msg.status === 'success' ? 'text-[#00A67E]' : 'text-[#627EEA]'}`}>
                        ELSA_BROKER // {msg.status?.toUpperCase()}
                      </span>
                    </div>
                  )}
                  {msg.content}
                </div>
              )}
            </div>
          </motion.div>
        ))}
        
        {isProcessing && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex justify-start"
          >
            <div className="glass-panel rounded-xl p-4 flex items-center text-[#00A67E] font-mono text-sm leading-none">
              <Loader2 size={16} className="animate-spin mr-2" /> 
              &gt; PARSING_INTENT...
            </div>
          </motion.div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input Area */}
      <form onSubmit={handleSubmit} className="z-10 relative mt-auto">
        <div className="absolute inset-0 bg-gradient-to-r from-[#627EEA]/20 to-[#8A2BE2]/20 rounded-xl blur-lg -z-10 pointer-events-none" />
        <div className="glass-panel flex items-center p-2 rounded-xl focus-within:border-[#627EEA] transition-colors">
          <span className="text-[#a3a3a3] font-mono pl-4 pr-2 select-none">&gt;</span>
          <input 
            type="text" 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isProcessing}
            autoFocus
            className="flex-1 bg-transparent border-none outline-none text-[#ededed] p-2 placeholder:text-[#a3a3a3]/50"
            placeholder="e.g. 'Analyze the SOL market. If sentiment is strong, long 100 SOL...'"
          />
          <button 
            type="submit"
            disabled={!input.trim() || isProcessing}
            className="p-3 ml-2 bg-[#627EEA] hover:bg-[#4E65CD] disabled:opacity-50 disabled:hover:bg-[#627EEA] transition-colors rounded-lg flex items-center justify-center text-white"
          >
            <Send size={18} />
          </button>
        </div>
      </form>
    </div>
  );
}
