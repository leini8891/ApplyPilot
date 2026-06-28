export type UsageMeterEventInput = {
  candidateId: string;
  eventType: string;
  provider?: string | null;
  searchCount?: number;
  aiCallCount?: number;
  metadata?: Record<string, unknown>;
};

export const recordUsage = ({
  candidateId,
  eventType,
  provider = null,
  searchCount = 0,
  aiCallCount = 0,
  metadata = {},
}: UsageMeterEventInput) => {
  console.info(
    '[usage-meter]',
    JSON.stringify({
      candidateId,
      eventType,
      provider,
      searchCount,
      aiCallCount,
      metadata,
      createdAt: new Date().toISOString(),
    }),
  );
};
