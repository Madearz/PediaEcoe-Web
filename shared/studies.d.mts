import type { CaseData, Interaction } from './clinical.mjs';
export type StudyFinding = { id: string; label: string; reply: string; kind: 'case' | 'simulated' | 'unavailable' };
export function requestedStudies(data: CaseData, question: string): { documented: Interaction[]; supplemental: StudyFinding[] } | null;
