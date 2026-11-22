import type { CaseData, Interaction } from './clinical.mjs';
export type StudyFinding = { id: string; label: string; reply: string; kind: 'case' | 'simulated' | 'unavailable' };
export function requestedStudies(data: CaseData, question: string, caseId?: string): { documented: Interaction[]; supplemental: StudyFinding[] } | null;
export function studySuggestions(data: CaseData, caseId?: string): { id: string; label: string; documented: boolean }[];
