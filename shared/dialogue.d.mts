import type { CaseData } from './clinical.mjs';
export const PATIENT_HISTORY_LIMIT: number;
export function patientAge(data: CaseData): string | undefined;
export function patientBackgroundReply(data: CaseData, question: string): string | null;
export function patientHistoryReply(data: CaseData, question: string, history?: { question: string }[]): string | null;
export function socialReply(question: string): string | null;
export function structured(data: CaseData, question: string, history?: { question: string }[]): string;
