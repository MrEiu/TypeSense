/**
 * server/questionnaire-ai-editor/file-reader.ts
 *
 * read_file tool implementation for line-based JSON slicing
 */

export interface ReadFileParams {
  start_line: number;
  end_line: number;
}

export interface ReadFileResult {
  success: boolean;
  content?: string;
  total_lines?: number;
  error?: string;
}

export class SurveyFileReader {
  /**
   * Slice lines from working survey JSON string with line numbers
   */
  public static readLines(jsonContent: string, params: ReadFileParams): ReadFileResult {
    const lines = jsonContent.split('\n');
    const totalLines = lines.length;

    let { start_line, end_line } = params;

    if (!Number.isInteger(start_line) || !Number.isInteger(end_line)) {
      return {
        success: false,
        error: `Invalid line numbers. start_line and end_line must be integers. Total lines: ${totalLines}.`,
      };
    }

    if (start_line < 1) start_line = 1;
    if (end_line > totalLines) end_line = totalLines;
    if (start_line > end_line) {
      return {
        success: false,
        error: `start_line (${start_line}) cannot be greater than end_line (${end_line}). Total lines: ${totalLines}.`,
      };
    }

    const selectedLines = lines.slice(start_line - 1, end_line);
    const formatted = selectedLines
      .map((line, idx) => `${start_line + idx}: ${line}`)
      .join('\n');

    return {
      success: true,
      content: formatted,
      total_lines: totalLines,
    };
  }
}
