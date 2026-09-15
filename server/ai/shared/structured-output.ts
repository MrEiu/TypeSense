/**
 * server/ai/shared/structured-output.ts
 *
 * Robust JSON extraction and parsing utilities for LLM outputs.
 * Tolerates Markdown fences, DeepSeek <think> reasoning tags, and trailing commas.
 */

export class StructuredOutputParser {
  /**
   * Strip reasoning tags like <think>...</think>
   */
  public static cleanThinkTags(raw: string): string {
    if (!raw) return '';
    return raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  }

  /**
   * Strip markdown code blocks like ```json ... ```
   */
  public static cleanMarkdownFences(raw: string): string {
    if (!raw) return '';
    return raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  }

  /**
   * Robust JSON extraction from raw model text
   */
  public static extractAndParseJson<T = any>(raw: string, fallback: T): T {
    if (!raw || typeof raw !== 'string') return fallback;

    // 1. Strip think tags
    let cleaned = this.cleanThinkTags(raw);

    // 2. Strip code fences
    cleaned = this.cleanMarkdownFences(cleaned);

    // 3. Attempt direct parse
    try {
      return JSON.parse(cleaned);
    } catch {
      // Continue to bracket isolation
    }

    // 4. Locate outermost { ... } or [ ... ]
    const firstBrace = cleaned.indexOf('{');
    const firstBracket = cleaned.indexOf('[');
    let startIdx = -1;
    let endIdx = -1;

    if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
      startIdx = firstBrace;
      endIdx = cleaned.lastIndexOf('}');
    } else if (firstBracket !== -1) {
      startIdx = firstBracket;
      endIdx = cleaned.lastIndexOf(']');
    }

    if (startIdx !== -1 && endIdx > startIdx) {
      const candidate = cleaned.slice(startIdx, endIdx + 1);
      try {
        return JSON.parse(candidate);
      } catch {
        // Attempt trailing comma repair
        try {
          const sanitized = candidate.replace(/,\s*([}\]])/g, '$1');
          return JSON.parse(sanitized);
        } catch {
          // Ignore parse failure
        }
      }
    }

    return fallback;
  }
}
