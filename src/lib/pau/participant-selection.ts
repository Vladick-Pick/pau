export function selectParticipantById<Participant extends { id: string }>(
  participants: Participant[],
  participantId: string | null
) {
  if (!participantId) {
    return participants[0] ?? null;
  }

  return (
    participants.find((participant) => participant.id === participantId) ??
    participants[0] ??
    null
  );
}

export function selectEventInScope<Event extends { id: string }>(
  events: Event[],
  eventId: string | null
) {
  if (!eventId) {
    return events[0] ?? null;
  }

  return events.find((event) => event.id === eventId) ?? events[0] ?? null;
}
