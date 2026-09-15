/**
 * server/questionnaire-ai-editor/agent.ts
 *
 * OpenAI Agent with read_file and edit_file tools for local survey JSON editing
 */

import OpenAI from 'openai';
import { ConfigService } from '../config-service';
import { EditorSession, EditorSessionManager } from './session';
import { SurveyFileReader } from './file-reader';
import { SurveyFileEditor, ReplacementChunk } from './file-editor';

export interface RunAgentOptions {
  sessionId: string;
  userPrompt: string;
}

export interface RunAgentResult {
  reply: string;
  toolCallsExecuted: number;
  hasWorkingChanges: boolean;
}

export class SurveyAiEditorAgent {
  /**
   * Run the AI editing agent loop on a session
   */
  public static async run(options: RunAgentOptions): Promise<RunAgentResult> {
    const { sessionId, userPrompt } = options;
    const session = EditorSessionManager.getSession(sessionId);
    if (!session) {
      throw new Error(`Session "${sessionId}" not found.`);
    }

    const config = ConfigService.getConfig();
    if (!config.apiKey) {
      throw new Error('OpenAI API Key is not configured. Please configure API credentials in system settings.');
    }

    const client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL || undefined,
    });

    // Record user message in history
    EditorSessionManager.addMessage(sessionId, {
      role: 'user',
      content: userPrompt,
    });

    const totalLines = session.workingJson.split('\n').length;

    const systemPrompt = `You are the TypeSense Questionnaire AI Editor.
You are tasked with editing a survey JSON file according to the user's instructions.

CRITICAL RULES:
1. You ONLY have access to the current questionnaire JSON. Total lines currently: ${totalLines}.
2. You have EXACTLY TWO tools:
   - "read_file": Read line ranges from the survey JSON.
   - "edit_file": Replace one or more line chunks in the survey JSON.
3. HOW TO EDIT:
   - Step 1: ALWAYS call "read_file" first to inspect the target questions/fields, line numbers, and exact formatting.
   - Step 2: Call "edit_file" with the precise start_line, end_line, target_content (which must EXACTLY match the file's lines), and replacement_content.
   - Step 3: Ensure replacement_content maintains valid JSON syntax (proper commas, matching braces/brackets).
   - Step 4: If edit_file returns an error or mismatch, call "read_file" to inspect the current state and adjust.
4. DO NOT attempt to rewrite the entire file if you only need to modify, add, or delete specific questions. Use local chunk replacement.
5. Answer the user politely and concisely in Chinese summarizing what was modified.`;

    const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
      {
        type: 'function',
        function: {
          name: 'read_file',
          description: 'Read a range of lines from the current questionnaire JSON with line numbers.',
          parameters: {
            type: 'object',
            properties: {
              start_line: {
                type: 'integer',
                description: '1-based starting line number to read from.',
              },
              end_line: {
                type: 'integer',
                description: '1-based ending line number (inclusive).',
              },
            },
            required: ['start_line', 'end_line'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'edit_file',
          description: 'Replace one or more target line chunks in the questionnaire JSON with new content.',
          parameters: {
            type: 'object',
            properties: {
              chunks: {
                type: 'array',
                description: 'List of replacement chunks.',
                items: {
                  type: 'object',
                  properties: {
                    start_line: {
                      type: 'integer',
                      description: '1-based starting line of the chunk to replace.',
                    },
                    end_line: {
                      type: 'integer',
                      description: '1-based ending line of the chunk to replace.',
                    },
                    target_content: {
                      type: 'string',
                      description: 'Exact character-for-character content currently present in lines [start_line, end_line].',
                    },
                    replacement_content: {
                      type: 'string',
                      description: 'The new JSON content to replace the target lines with.',
                    },
                  },
                  required: ['start_line', 'end_line', 'target_content', 'replacement_content'],
                },
              },
            },
            required: ['chunks'],
          },
        },
      },
    ];

    // Build messages list including recent conversation history
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
    ];

    // Include last 6 messages for multi-turn context
    const recentHistory = session.chatHistory.slice(-6);
    for (const msg of recentHistory) {
      messages.push({
        role: msg.role,
        content: msg.content,
      });
    }

    let toolCallsExecuted = 0;
    const maxIterations = 8;
    let iteration = 0;
    let finalReply = '';

    while (iteration < maxIterations) {
      iteration++;

      const modelName = config.model && config.model.trim() ? config.model.trim() : 'gpt-4o';

      const response = await client.chat.completions.create({
        model: modelName,
        messages,
        tools,
        tool_choice: 'auto',
        temperature: 0.2,
      });

      const choice = response.choices[0];
      if (!choice || !choice.message) {
        break;
      }

      const message = choice.message;
      messages.push(message);

      if (!message.tool_calls || message.tool_calls.length === 0) {
        finalReply = message.content || '已完成修改。';
        break;
      }

      // Execute tool calls
      for (const toolCall of message.tool_calls) {
        toolCallsExecuted++;
        const toolName = toolCall.function.name;
        let toolArgs: Record<string, any> = {};
        try {
          toolArgs = JSON.parse(toolCall.function.arguments || '{}');
        } catch {
          toolArgs = {};
        }

        let toolResultStr = '';

        if (toolName === 'read_file') {
          const res = SurveyFileReader.readLines(session.workingJson, {
            start_line: Number(toolArgs.start_line),
            end_line: Number(toolArgs.end_line),
          });
          toolResultStr = JSON.stringify(res);
        } else if (toolName === 'edit_file') {
          const res = SurveyFileEditor.applyEdits(
            session.workingJson,
            toolArgs.chunks as ReplacementChunk[]
          );
          if (res.success && res.new_content && res.parsed_survey) {
            // Update session working copy
            EditorSessionManager.updateWorking(sessionId, res.new_content, res.parsed_survey);
            toolResultStr = JSON.stringify({
              success: true,
              message: 'Chunks successfully replaced and validated. Working copy updated.',
            });
          } else {
            toolResultStr = JSON.stringify({
              success: false,
              error: res.error,
            });
          }
        } else {
          toolResultStr = JSON.stringify({ success: false, error: `Unknown tool: ${toolName}` });
        }

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: toolResultStr,
        });
      }
    }

    if (!finalReply) {
      finalReply = '已根据您的要求完成局部修改并校验通过。请在界面上查看差异并确认。';
    }

    // Record assistant message
    EditorSessionManager.addMessage(sessionId, {
      role: 'assistant',
      content: finalReply,
    });

    const diff = EditorSessionManager.getDiffSummary(sessionId);

    return {
      reply: finalReply,
      toolCallsExecuted,
      hasWorkingChanges: diff.hasChanges,
    };
  }
}
