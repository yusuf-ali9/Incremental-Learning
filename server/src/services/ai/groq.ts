import {
  AIError,
  type AIProvider,
  type ClozeResult,
  type SocraticGrade,
} from "./provider.js";
import {
  ATOMIZE_SYSTEM,
  CLOZE_SYSTEM,
  SOCRATIC_GRADE_SYSTEM,
  SOCRATIC_QUESTION_SYSTEM,
} from "./prompts.js";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

export class GroqProvider implements AIProvider {
  constructor(
    private apiKey: string,
    private model: string
  ) {}

  private async chatJson(system: string, user: string): Promise<any> {
    if (!this.apiKey) {
      throw new AIError("GROQ_API_KEY is not set. AI features are unavailable.");
    }

    let res: Response;
    try {
      res = await fetch(GROQ_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          temperature: 0.3,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
      });
    } catch (err) {
      // Network failure (offline) lands here.
      throw new AIError(
        `Could not reach Groq (are you online?): ${(err as Error).message}`
      );
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new AIError(`Groq API error ${res.status}: ${body.slice(0, 300)}`);
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new AIError("Groq returned an empty response.");

    try {
      return JSON.parse(content);
    } catch {
      throw new AIError("Groq returned malformed JSON.");
    }
  }

  async atomize(extractText: string): Promise<string[]> {
    const json = await this.chatJson(ATOMIZE_SYSTEM, extractText);
    const atoms = json?.atoms;
    if (!Array.isArray(atoms) || atoms.length === 0) {
      throw new AIError("Atomization produced no atoms.");
    }
    return atoms.map((a) => String(a)).filter((a) => a.trim().length > 0);
  }

  async cloze(atomContent: string): Promise<ClozeResult> {
    const json = await this.chatJson(CLOZE_SYSTEM, atomContent);
    if (!json?.cloze_text || !json?.answer) {
      throw new AIError("Cloze generation returned incomplete data.");
    }
    return { cloze_text: String(json.cloze_text), answer: String(json.answer) };
  }

  async socraticQuestion(atomContent: string): Promise<string> {
    const json = await this.chatJson(SOCRATIC_QUESTION_SYSTEM, atomContent);
    if (!json?.question) throw new AIError("No Socratic question returned.");
    return String(json.question);
  }

  async gradeSocratic(
    question: string,
    userAnswer: string
  ): Promise<SocraticGrade> {
    const json = await this.chatJson(
      SOCRATIC_GRADE_SYSTEM,
      `Question: ${question}\n\nStudent answer: ${userAnswer}`
    );
    return {
      score: Math.max(0, Math.min(5, Number(json?.score) || 0)),
      feedback: String(json?.feedback ?? ""),
      followUp: String(json?.followUp ?? ""),
    };
  }
}
