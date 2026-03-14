// /backend/src/app/api/heyelsa/route.ts
import { NextResponse } from 'next/server';
import { elsaClient } from '@/services/heyelsaClient';
// import { segregateTasks } from '@/services/llmNegotiator';
// import { lockEscrow } from '@/services/blockchain';

export async function POST(req: Request) {
  try {
    const { userPrompt, walletAddress } = await req.json();
    console.log(`[HeyElsa API] Received user prompt: ${userPrompt}`);

    // 1. Pass the prompt to the LLM Negotiator to break it into chunks
    // Example: "Analyze PEPE contract and buy $10 worth if safe"
    /*
    const requiredTasks = await segregateTasks(userPrompt);
    */

    // 2. Take those broken-down tasks and post bounties to your Smart Contract
    /*
    const activeBounties = await lockEscrow(requiredTasks, walletAddress);
    */

    // 3. Return the state to the frontend so it can render the "Negotiating..." UI
    return NextResponse.json({
      status: "processing",
      message: "Intent delegated to AI Agent Marketplace",
      tasks: [
        { id: 1, type: "security_audit", status: "bidding", maxBid: "0.5 USDC" },
        { id: 2, type: "sentiment_analysis", status: "bidding", maxBid: "0.2 USDC" }
      ]
    }, { status: 200 });

  } catch (error) {
    console.error("[HeyElsa API] Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}