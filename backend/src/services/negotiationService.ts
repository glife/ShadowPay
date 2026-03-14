import { db } from "@/lib/db";
import { fail } from "@/lib/errors";
import { submitBid } from "@/services/bidService";
import { broadcast } from "@/services/sseManager";

export const getLastOffer = async (jobId: string) => {
  return db.negotiationOffer.findFirst({
    where: { jobId },
    orderBy: { createdAt: "desc" },
  });
};

export const makeOffer = async (
  jobId: string,
  senderId: string,
  receiverId: string,
  amount: string | number,
) => {
  if (senderId === receiverId) throw fail("Cannot send offer to yourself", 400);

  const offer = await db.negotiationOffer.create({
    data: {
      jobId,
      senderId,
      receiverId,
      amount: String(amount),
      type: "offer",
    },
  });

  broadcast("negotiation.offer", {
    jobId,
    offerId: offer.id,
    senderId,
    receiverId,
    amount: String(amount),
  });

  return offer;
};

export const counter = async (jobId: string, senderId: string, amount: string | number) => {
  const last = await getLastOffer(jobId);
  if (!last) throw fail("No offer to counter", 400);
  if (last.receiverId !== senderId) throw fail("Not your turn", 403);

  const counterOffer = await db.negotiationOffer.create({
    data: {
      jobId,
      senderId,
      receiverId: last.senderId,
      amount: String(amount),
      type: "counter",
    },
  });

  broadcast("negotiation.counter", {
    jobId,
    offerId: counterOffer.id,
    senderId,
    receiverId: last.senderId,
    amount: String(amount),
  });

  return counterOffer;
};

export const accept = async (jobId: string, senderId: string) => {
  const last = await getLastOffer(jobId);
  if (!last) throw fail("No offer to accept", 400);
  if (last.receiverId !== senderId) throw fail("Not your turn", 403);

  await db.negotiationOffer.create({
    data: {
      jobId,
      senderId,
      receiverId: last.senderId,
      amount: last.amount,
      type: "accept",
    },
  });

  const bid = await submitBid(jobId, senderId, last.amount.toString(), "Agreed via negotiation");

  broadcast("negotiation.accepted", {
    jobId,
    senderId,
    receiverId: last.senderId,
    amount: last.amount.toString(),
    bidId: bid.id,
  });

  return bid;
};
