import type { CaseData, Grade, Rubric } from './clinical.mjs';
export type ReviewTurn = { question: string; reply: string };
export type ReviewFacts = {
  result: Grade;
  decisions: { label: string; expected?: { label: string; tip: string } }[];
  scenario?: string;
  opening?: string;
  observations: { label: string; reply: string }[];
};
export function reviewFacts(result: Grade, snapshot?: { public: CaseData; rubric: Rubric }): ReviewFacts;
export function reviewReply(facts: ReviewFacts, question: string, history?: ReviewTurn[]): string;
