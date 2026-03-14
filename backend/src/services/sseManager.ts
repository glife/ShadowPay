type Client = {
  id: string;
  send: (payload: string) => void;
  close: () => void;
};

const clients = new Map<string, Client>();

export const addClient = (client: Client) => {
  clients.set(client.id, client);
};

export const removeClient = (clientId: string) => {
  const client = clients.get(clientId);
  if (!client) return;
  client.close();
  clients.delete(clientId);
};

export const broadcast = (eventType: string, data: Record<string, unknown>) => {
  const payload = `data: ${JSON.stringify({ type: eventType, ...data })}\n\n`;
  for (const client of clients.values()) {
    try {
      client.send(payload);
    } catch {
      clients.delete(client.id);
    }
  }
};
