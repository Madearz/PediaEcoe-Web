import type { CaseData, Interaction } from './clinical.mjs';
export type ExamArea = 'vitals' | 'respiratory' | 'cardiovascular' | 'abdomen' | 'neurological' | 'skin' | 'ent' | 'musculoskeletal' | 'other';
export const EXAM_AREAS: Record<ExamArea, string>;
export function normalizeClinicalRequest(text: string): string;
export function examAreas(label: string): ExamArea[];
export function requestedExam(interactions: Interaction[], question: string): Interaction[] | null;
export function systemExam(data: CaseData, area: ExamArea): { recorded: Interaction[]; reply: string };
