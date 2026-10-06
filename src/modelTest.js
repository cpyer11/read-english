// A fixed advanced sentence checks a real generation request without using webpage text.
export const MODEL_TEST_SOURCE = "Notwithstanding the unforeseen setbacks, the committee remained resolute in its determination to implement a solution that would benefit the community.";

export function buildModelTestPrompt() {
  return [
    "Rewrite the following advanced English sentence for a learner at CEFR A2.",
    "Use common everyday words and short, simple sentences. Keep the original meaning and make the ideas concrete.",
    "You may use up to three short sentences. Do not introduce challenging words or expressions.",
    "Return only the rewritten English text. Do not translate into another language, add a heading, explain your changes, or discuss CEFR levels.",
    "Sentence:",
    MODEL_TEST_SOURCE,
  ].join("\n");
}
