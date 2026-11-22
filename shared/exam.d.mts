export type ExamArea = 'vitals' | 'respiratory' | 'cardiovascular' | 'abdomen' | 'neurological' | 'skin' | 'other';
export const EXAM_AREAS: Record<ExamArea, string>;
export function examAreas(label: string): ExamArea[];
