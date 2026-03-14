// /backend/src/services/heyelsaClient.ts
import { HeyElsa } from 'heyelsa-sdk'; // Make sure to install the SDK in the /backend folder

if (!process.env.HEYELSA_API_KEY) {
  throw new Error("Missing HEYELSA_API_KEY");
}

export const elsaClient = new HeyElsa({
  apiKey: process.env.HEYELSA_API_KEY,
  environment: 'testnet',
});