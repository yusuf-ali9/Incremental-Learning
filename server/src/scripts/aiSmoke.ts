// Smoke-test the AI provider against Groq. Run: npm --workspace server run ai:smoke
import { ai, AI_ENABLED, GROQ_MODEL } from "../config.js";

const SAMPLE = `The Ottoman Empire was slow to adopt the printing press. Although
Gutenberg's press appeared in Europe around 1450, the first Ottoman Turkish press
was not established until 1727 by Ibrahim Muteferrika.`;

async function main() {
  if (!AI_ENABLED) {
    console.error("GROQ_API_KEY not set. Put it in server/.env first.");
    process.exit(1);
  }
  console.log(`Using model: ${GROQ_MODEL}\n`);

  console.log("== atomize ==");
  const atoms = await ai.atomize(SAMPLE);
  atoms.forEach((a, i) => console.log(`  ${i + 1}. ${a}`));

  console.log("\n== cloze (first atom) ==");
  const cloze = await ai.cloze(atoms[0]);
  console.log(JSON.stringify(cloze, null, 2));

  console.log("\n== socratic question (first atom) ==");
  const q = await ai.socraticQuestion(atoms[0]);
  console.log(`  Q: ${q}`);

  console.log("\n== grade a sample answer ==");
  const grade = await ai.gradeSocratic(q, "Because of religious and guild opposition.");
  console.log(JSON.stringify(grade, null, 2));

  console.log("\nAll AI calls succeeded.");
}

main().catch((err) => {
  console.error("Smoke test failed:", err.message);
  process.exit(1);
});
