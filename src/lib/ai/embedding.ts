import OpenAI from "openai";

export async function createEmbedding(input: string, apiKey: string, model: string): Promise<number[]> {
  const openai = new OpenAI({ apiKey });
  const response = await openai.embeddings.create({
    model,
    input,
  });

  const embedding = response.data[0]?.embedding;
  if (!embedding) {
    throw new Error("OpenAI embeddings response did not include an embedding");
  }
  return embedding;
}
