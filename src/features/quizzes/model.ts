export type QuestionKind = 'multiple_choice' | 'true_false' | 'short_answer';
export type StoredQuestion = { type: QuestionKind; prompt: string; points: number; options: string[]; correct_position: number | null; accepted_answers: string[]; manual_grading: boolean };
export type QuizDocument = { quiz_id: string; folder_id: string | null; title: string; version_id: string; revision: number; version_number: number; status: 'draft' | 'published'; questions: StoredQuestion[] };
export type EditorQuestion = Omit<StoredQuestion, 'points' | 'accepted_answers'> & { key: string; points: string; acceptedText: string };
export function newQuestion(type: QuestionKind): EditorQuestion {
 return { key: `${Date.now()}-${Math.random()}`, type, prompt: '', points: '1', options: type === 'true_false' ? ['True','False'] : type === 'multiple_choice' ? ['',''] : [], correct_position: null, acceptedText: '', manual_grading: false };
}
export function editQuestions(questions: StoredQuestion[]): EditorQuestion[] {
 return questions.map(q => ({ ...q, key: `${Date.now()}-${Math.random()}`, points: String(q.points), acceptedText: q.accepted_answers.join('\n') }));
}
export function serializeQuestions(questions: EditorQuestion[]): StoredQuestion[] {
 return questions.map((q,index) => {
  const points=Number(q.points);
  if(!q.points.trim() || !Number.isFinite(points) || points<0 || points>1000 || Math.abs(points*100-Math.round(points*100))>0.000001) throw new Error(`Question ${index+1}: use points from 0 to 1000 with up to two decimal places.`);
  return { type:q.type,prompt:q.prompt.trim(),points,options:q.options.map(s=>s.trim()),correct_position:q.correct_position,accepted_answers:q.type==='short_answer'?q.acceptedText.split('\n').map(s=>s.trim()).filter(Boolean):[],manual_grading:q.type==='short_answer'&&q.manual_grading };
 });
}