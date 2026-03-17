import { invokeLLM } from "../_core/llm";
import type { Contact } from "../../drizzle/schema";

export interface PersonalizationInput {
  contact: Partial<Contact>;
  stepType: "initial" | "follow_up" | "last_notice" | "opened_no_reply";
  baseSubject: string;
  baseBody: string;
}

export interface PersonalizationOutput {
  subject: string;
  body: string;
}

const STEP_CONTEXT: Record<string, string> = {
  initial: "This is the first outreach email. Be warm, professional, and concise. Focus on value proposition.",
  follow_up: "This is a follow-up email. Reference the previous outreach briefly. Keep it short and add a new angle.",
  last_notice: "This is the final email in the sequence. Be respectful, acknowledge their busy schedule, and leave the door open.",
  opened_no_reply: "The recipient opened the previous email but did not reply. They showed interest. Re-engage with a compelling hook.",
};

export async function generatePersonalizedEmail(
  input: PersonalizationInput
): Promise<PersonalizationOutput> {
  const { contact, stepType, baseSubject, baseBody } = input;

  const contactContext = [
    contact.firstName ? `Name: ${contact.firstName} ${contact.lastName ?? ""}` : "",
    contact.title ? `Title: ${contact.title}` : "",
    contact.company ? `Company: ${contact.company}` : "",
    contact.industry ? `Industry: ${contact.industry}` : "",
    contact.companySize ? `Company size: ${contact.companySize}` : "",
    contact.location ? `Location: ${contact.location}` : "",
  ].filter(Boolean).join("\n");

  const systemPrompt = `You are an expert B2B headhunting outreach specialist for Behberg, a professional headhunting agency. 
You write highly personalized, concise, and effective cold outreach emails.
${STEP_CONTEXT[stepType] ?? ""}

Rules:
- Keep emails under 150 words
- Be specific to their role, company, and industry
- Sound human and genuine, not like a template
- Never use buzzwords like "synergy", "leverage", "game-changer"
- Sign off professionally
- Return ONLY valid JSON with "subject" and "body" fields`;

  const userPrompt = `Personalize this email for the following contact:

${contactContext}

Base subject: ${baseSubject}
Base email body:
${baseBody}

Return a JSON object with "subject" and "body" fields. The body should be plain text (no HTML).`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "email_personalization",
          strict: true,
          schema: {
            type: "object",
            properties: {
              subject: { type: "string", description: "The personalized email subject line" },
              body: { type: "string", description: "The personalized email body in plain text" },
            },
            required: ["subject", "body"],
            additionalProperties: false,
          },
        },
      },
    });

    const rawContent = response.choices?.[0]?.message?.content;
    const content = typeof rawContent === "string" ? rawContent : null;
    if (!content) throw new Error("Empty LLM response");

    const parsed = JSON.parse(content);
    return {
      subject: parsed.subject ?? baseSubject,
      body: parsed.body ?? baseBody,
    };
  } catch (err: any) {
    console.warn("[LLM] Personalization failed:", err.message);
    return { subject: baseSubject, body: baseBody };
  }
}

export async function generateEmailVariations(
  contact: Partial<Contact>,
  stepType: "initial" | "follow_up" | "last_notice" | "opened_no_reply",
  count: number = 3
): Promise<PersonalizationOutput[]> {
  const contactContext = [
    contact.firstName ? `Name: ${contact.firstName} ${contact.lastName ?? ""}` : "",
    contact.title ? `Title: ${contact.title}` : "",
    contact.company ? `Company: ${contact.company}` : "",
    contact.industry ? `Industry: ${contact.industry}` : "",
  ].filter(Boolean).join("\n");

  const systemPrompt = `You are an expert B2B headhunting outreach specialist for Behberg.
Generate ${count} different email variations for a ${stepType.replace("_", " ")} email.
${STEP_CONTEXT[stepType] ?? ""}
Each variation should have a different angle or hook.
Return ONLY valid JSON.`;

  const userPrompt = `Contact info:
${contactContext}

Generate ${count} email variations. Return a JSON object with a "variations" array, each item having "subject" and "body" fields.`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "email_variations",
          strict: true,
          schema: {
            type: "object",
            properties: {
              variations: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    subject: { type: "string" },
                    body: { type: "string" },
                  },
                  required: ["subject", "body"],
                  additionalProperties: false,
                },
              },
            },
            required: ["variations"],
            additionalProperties: false,
          },
        },
      },
    });

    const rawContent = response.choices?.[0]?.message?.content;
    const content = typeof rawContent === "string" ? rawContent : null;
    if (!content) throw new Error("Empty LLM response");
    const parsed = JSON.parse(content);
    return parsed.variations ?? [];
  } catch (err: any) {
    console.warn("[LLM] Variation generation failed:", err.message);
    return [];
  }
}
