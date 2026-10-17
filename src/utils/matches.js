export const unwrapMatch = (value) => {
  const match = value?.match || value?.data?.match || value?.data || value;
  if (!match || typeof match !== 'object') return match;
  return {
    ...match,
    id: match.matchId ?? match.id,
  };
};

export const unwrapMatches = (value) => {
  if (Array.isArray(value)) return value.map(unwrapMatch);
  const collection = value?.matches || value?.content || value?.results || value?.data;
  if (Array.isArray(collection)) return collection.map(unwrapMatch);
  const nestedCollection = collection?.matches || collection?.content;
  return Array.isArray(nestedCollection) ? nestedCollection.map(unwrapMatch) : [];
};

export const isComplete = (match) => /complete|finished/i.test(
  `${match?.status || ''} ${match?.state || ''}`,
);

export const teamName = (match, side) => match?.[side]
  || match?.[`${side}Name`]
  || match?.teams?.[side === 'teamA' ? 0 : 1]?.name
  || (side === 'teamA' ? 'Home team' : 'Away team');

export const matchScore = (match, side) => match?.[`${side}Score`]
  || match?.scores?.[side === 'teamA' ? 0 : 1]
  || (side === 'teamA' ? match?.score : null);
