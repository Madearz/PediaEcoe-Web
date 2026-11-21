import type { CaseData } from './clinical.mjs';
export function socialReply(question: string): string | null;
export function structured(data: CaseData, question: string, history?: { question: string }[]): string;
