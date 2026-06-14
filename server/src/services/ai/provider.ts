// AI behind an interface so Groq can be swapped/augmented later (e.g. Claude).
export interface ClozeResult {
  cloze_text: string; // the atom with the key piece replaced by "{{...}}"
  answer: string; // the deleted piece
}

export interface SocraticGrade {
  score: number; // 0..5
  feedback: string;
  followUp: string;
}

export interface AIProvider {
  // Minimum-information principle: break an extract into atomic facts.
  atomize(extractText: string): Promise<string[]>;
  // Generate a single cloze deletion from one atom.
  cloze(atomContent: string): Promise<ClozeResult>;
  // Socratic tutor: grade a free-response answer and ask a follow-up.
  gradeSocratic(question: string, userAnswer: string): Promise<SocraticGrade>;
  // Generate a probing Socratic question for an atom.
  socraticQuestion(atomContent: string): Promise<string>;
}

export class AIError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AIError";
  }
}
