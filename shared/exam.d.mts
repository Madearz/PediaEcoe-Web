import type { Interaction } from './clinical.mjs';
export type ExamArea = 'vitals' | 'respiratory' | 'cardiovascular' | 'abdomen' | 'neurological' | 'skin' | 'other';
export const EXAM_AREAS: Record<ExamArea, string>;
export function normalizeClinicalRequest(text: string): string;
export function examAreas(label: string): ExamArea[];
export function requestedExam(interactions: Interaction[], question: string): Interaction[] | null;
