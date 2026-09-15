/**
 * server/questionnaire-ai-editor/file-editor.ts
 *
 * edit_file tool implementation for line chunk verification and replacement
 */

import { SurveyValidator } from './validator';

export interface ReplacementChunk {
  start_line: number;
  end_line: number;
  target_content: string;
  replacement_content: string;
}

export interface EditFileResult {
  success: boolean;
  new_content?: string;
  parsed_survey?: Record<string, unknown>;
  error?: string;
}

export class SurveyFileEditor {
  /**
   * Apply replacement chunks to survey JSON with strict verification
   */
  public static applyEdits(
    currentJson: string,
    chunks: ReplacementChunk[]
  ): EditFileResult {
    if (!Array.isArray(chunks) || chunks.length === 0) {
      return { success: false, error: 'No replacement chunks provided.' };
    }

    const lines = currentJson.replace(/\r\n/g, '\n').split('\n');
    const totalLines = lines.length;

    // Sort chunks descending by start_line to keep earlier indices intact
    const sortedChunks = [...chunks].sort((a, b) => b.start_line - a.start_line);

    // 1. Verify line range and target_content for each chunk
    for (const chunk of sortedChunks) {
      const { start_line, end_line, target_content } = chunk;

      if (!Number.isInteger(start_line) || !Number.isInteger(end_line)) {
        return {
          success: false,
          error: `Line numbers must be integers. Received start_line: ${start_line}, end_line: ${end_line}.`,
        };
      }

      if (start_line < 1 || end_line > totalLines || start_line > end_line) {
        return {
          success: false,
          error: `Invalid line range [${start_line}, ${end_line}]. Total lines in file: ${totalLines}.`,
        };
      }

      const existingSlice = lines.slice(start_line - 1, end_line).join('\n');
      const normalizedTarget = target_content.replace(/\r\n/g, '\n').trimEnd();
      const normalizedExisting = existingSlice.trimEnd();

      if (normalizedExisting !== normalizedTarget) {
        return {
          success: false,
          error: `Content mismatch at lines ${start_line}-${end_line}.\nExpected:\n"""\n${normalizedTarget}\n"""\nActual in file:\n"""\n${normalizedExisting}\n"""\nPlease use read_file to inspect current lines and update target_content.`,
        };
      }
    }

    // 2. Perform replacements
    const modifiedLines = [...lines];
    for (const chunk of sortedChunks) {
      const { start_line, end_line, replacement_content } = chunk;
      const newLines = replacement_content.replace(/\r\n/g, '\n').split('\n');
      const deleteCount = end_line - start_line + 1;
      modifiedLines.splice(start_line - 1, deleteCount, ...newLines);
    }

    const newContent = modifiedLines.join('\n');

    // 3. Verify JSON syntax
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(newContent);
    } catch (err: any) {
      return {
        success: false,
        error: `Replacement resulted in invalid JSON syntax: ${err.message}. Please check brackets, commas and quotes.`,
      };
    }

    // 4. Verify Questionnaire Schema Structure
    const validation = SurveyValidator.validateSurvey(parsed);
    if (!validation.valid) {
      return {
        success: false,
        error: `Replacement resulted in invalid survey structure: ${validation.error}`,
      };
    }

    return {
      success: true,
      new_content: newContent,
      parsed_survey: parsed,
    };
  }
}
