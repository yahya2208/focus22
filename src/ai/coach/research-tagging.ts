import type { ResearchTag } from './types';

export interface TaggedOutput<T> {
  readonly data: T;
  readonly researchTag: ResearchTag;
  readonly justification: string;
}

export function tagOutput<T>(data: T, tag: ResearchTag, justification: string): TaggedOutput<T> {
  return { data, researchTag: tag, justification };
}

export function classifyTag(params: {
  readonly hasPeerReviewedBasis: boolean;
  readonly sampleSize: number;
  readonly confidence: number;
}): ResearchTag {
  if (params.hasPeerReviewedBasis && params.sampleSize >= 30 && params.confidence >= 70) {
    return 'scientific';
  }
  if (params.sampleSize >= 5 && params.confidence >= 40) {
    return 'experimental';
  }
  return 'informational';
}

export function getTagLabel(tag: ResearchTag): string {
  switch (tag) {
    case 'scientific': return 'Scientific — Based on peer-reviewed research';
    case 'experimental': return 'Experimental — Based on limited data';
    case 'informational': return 'Informational — General guidance';
  }
}

export function filterByTag<T extends { readonly researchTag: ResearchTag }>(
  items: readonly T[],
  minTag: ResearchTag,
): readonly T[] {
  const tagOrder: readonly ResearchTag[] = ['informational', 'experimental', 'scientific'];
  const minIndex = tagOrder.indexOf(minTag);
  return items.filter((item) => tagOrder.indexOf(item.researchTag) >= minIndex);
}
