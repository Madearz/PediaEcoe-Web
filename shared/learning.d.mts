import type { Grade, Interaction } from './clinical.mjs';
export const JUSTIFICATION_LIMIT: number;
export const FOLLOW_UP: { reevaluar: string; observar: string; escalar: string };
export type FollowUp = keyof typeof FOLLOW_UP;
export const PRACTICE_TIPS: string[];
export function registerAnamnesis(interactions: Interaction[], question: string, previous?: string[]): { evidence: string[]; registered: string[] };
export function practiceFocus<T extends Pick<Grade, 'domains' | 'caseId'>>(results: T[]): { index: number; sampleSize: number; result: T | undefined } | null;
