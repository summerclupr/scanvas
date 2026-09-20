/**
 * Resume skill extraction, using the local model.
 *
 * The resume never leaves the device - it goes to your own Ollama and
 * nowhere else, which is the only reason reading a resume at all is
 * acceptable here.
 *
 * Input is resume TEXT, not the PDF. Parsing PDFs on-device would need a
 * heavyweight dependency that behaves differently on web and native, and a
 * half-working parser that silently extracts garbage is worse than asking
 * for a paste: the extracted skills drive ranking, so wrong input means
 * quietly wrong results. Select-all in any PDF viewer and paste.
 *
 * Extracted skills are always shown as editable chips before they affect
 * anything - the model is a suggestion engine here, not an authority.
 */

import { chatJSON, type OllamaConfig } from '../llm/ollama';

const SCHEMA = {
  type: 'object',
  properties: {
    skills: { type: 'array', items: { type: 'string' } },
    fields: { type: 'array', items: { type: 'string' } },
  },
  required: ['skills', 'fields'],
} as const;

const SYSTEM = `You read a student resume and list what they can actually do.

Return two arrays:

"skills" - 8 to 15 concrete, searchable capabilities. Languages, frameworks,
tools, lab techniques, methods. Lowercase. Examples: "python", "pytorch",
"verilog", "cad", "pcb design", "cell culture", "monte carlo".

"fields" - 2 to 5 broader areas the work sits in. Examples:
"machine learning", "robotics", "synthetic biology", "quantitative finance".

Rules:
- ONLY list things actually present in the resume. Never infer a skill from
  a job title or a course name alone.
- No soft skills ("teamwork", "communication"). No degrees. No company names.
- Prefer the specific term the resume uses.

Respond with JSON only.`;

export interface ResumeExtraction {
  skills: string[];
  fields: string[];
}

export async function extractResumeSkills(
  cfg: OllamaConfig,
  resumeText: string,
): Promise<ResumeExtraction> {
  const text = resumeText.trim().slice(0, 8000);
  if (text.length < 80) {
    throw new Error('That looks too short to be a resume.');
  }

  const out = await chatJSON<ResumeExtraction>(
    cfg,
    [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: `Resume:\n\n${text}\n\nExtract.` },
    ],
    SCHEMA,
  );

  const clean = (arr: string[] | undefined) =>
    [
      ...new Set(
        (arr ?? [])
          .map((s) => s.toLowerCase().trim())
          .filter((s) => s.length > 1 && s.length < 40),
      ),
    ];

  return { skills: clean(out.skills).slice(0, 20), fields: clean(out.fields).slice(0, 6) };
}
