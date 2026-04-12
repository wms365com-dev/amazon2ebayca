import { OpportunityStatus } from "@prisma/client";

import { prisma } from "../db/prisma";

export async function updateOpportunityStatus(
  opportunityId: number,
  status: OpportunityStatus,
  note?: string
) {
  const current = await prisma.opportunity.findUniqueOrThrow({
    where: { id: opportunityId }
  });

  if (current.status === status) {
    return current;
  }

  const updated = await prisma.opportunity.update({
    where: { id: opportunityId },
    data: { status }
  });

  await prisma.opportunityStatusHistory.create({
    data: {
      opportunityId,
      fromStatus: current.status,
      toStatus: status,
      note: note?.trim() || null
    }
  });

  return updated;
}

export async function saveOpportunityNotes(opportunityId: number, notes: string) {
  return prisma.opportunity.update({
    where: { id: opportunityId },
    data: { notes }
  });
}
