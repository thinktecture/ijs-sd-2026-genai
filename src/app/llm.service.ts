import { Injectable, OnDestroy, signal, computed } from '@angular/core';
import {
  AutoModelForCausalLM,
  AutoTokenizer,
  TextStreamer,
} from '@huggingface/transformers';

export interface LLMState {
  isLoading: boolean;
  isReady: boolean;
  error: string | null;
  progress: number;
}

export interface LLMInstance {
  model: any;
  tokenizer: any;
}

const moduleCache: {
  [modelId: string]: {
    instance: LLMInstance | null;
    loadingPromise: Promise<LLMInstance> | null;
  };
} = {};

@Injectable({
  providedIn: 'root',
})
export class LlmService implements OnDestroy {
  readonly state = signal<LLMState>({
    isLoading: false,
    isReady: false,
    error: null,
    progress: 0,
  });

  readonly isLoading = computed(() => this.state().isLoading);
  readonly isReady = computed(() => this.state().isReady);
  readonly error = computed(() => this.state().error);
  readonly progress = computed(() => this.state().progress);

  private instance: LLMInstance | null = null;
  private loadingPromise: Promise<LLMInstance> | null = null;
  private abortController: AbortController | null = null;
  private pastKeyValues: any = null;

  async loadModel(modelId: string, dtype: 'q4' | 'q4f16' = 'q4f16'): Promise<LLMInstance> {
    if (!modelId) {
      throw new Error('Model ID is required');
    }

    const MODEL_ID = `onnx-community/LFM2-${modelId}-ONNX`;

    if (!moduleCache[modelId]) {
      moduleCache[modelId] = {
        instance: null,
        loadingPromise: null,
      };
    }

    const cache = moduleCache[modelId];

    const existingInstance = this.instance || cache.instance;
    if (existingInstance) {
      this.instance = existingInstance;
      cache.instance = existingInstance;
      this.state.update((prev) => ({ ...prev, isReady: true, isLoading: false }));
      return existingInstance;
    }

    const existingPromise = this.loadingPromise || cache.loadingPromise;
    if (existingPromise) {
      try {
        const instance = await existingPromise;
        this.instance = instance;
        cache.instance = instance;
        this.state.update((prev) => ({ ...prev, isReady: true, isLoading: false }));
        return instance;
      } catch (error) {
        this.state.update((prev) => ({
          ...prev,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Failed to load model',
        }));
        throw error;
      }
    }

    this.state.update((prev) => ({
      ...prev,
      isLoading: true,
      error: null,
      progress: 0,
    }));

    this.abortController = new AbortController();

    const loadingPromise = (async () => {
      try {
        const progressCallback = (progressData: any) => {
          if (
            progressData.status === 'progress' &&
            progressData.file.endsWith('.onnx_data')
          ) {
            const percentage = Math.round(
              (progressData.loaded / progressData.total) * 100
            );
            this.state.update((prev) => ({ ...prev, progress: percentage }));
          }
        };

        const tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID, {
          progress_callback: progressCallback,
        });

        const model = await AutoModelForCausalLM.from_pretrained(MODEL_ID, {
          dtype,
          device: 'webgpu',
          progress_callback: progressCallback,
        });

        const instance = { model, tokenizer };
        this.instance = instance;
        cache.instance = instance;
        this.loadingPromise = null;
        cache.loadingPromise = null;

        this.state.update((prev) => ({
          ...prev,
          isLoading: false,
          isReady: true,
          progress: 100,
        }));
        return instance;
      } catch (error) {
        this.loadingPromise = null;
        cache.loadingPromise = null;
        this.state.update((prev) => ({
          ...prev,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Failed to load model',
        }));
        throw error;
      }
    })();

    this.loadingPromise = loadingPromise;
    cache.loadingPromise = loadingPromise;
    return loadingPromise;
  }

  async *generateResponse(
    messages: Array<{ role: string; content: string }>,
    tools: Array<any> = [],
    options: { measurePerformance?: boolean } = {}
  ): AsyncGenerator<string, string, void> {
    if (!this.instance) {
      throw new Error('Model not loaded. Call loadModel() first.');
    }

    const { model, tokenizer } = this.instance;
    const start = performance.now();

    const input = tokenizer.apply_chat_template(messages, {
      tools,
      add_generation_prompt: true,
      return_dict: true,
    });

    const queue: string[] = [];
    let resolveNext: (() => void) | null = null;
    let isFinished = false;
    let generationError: Error | null = null;

    const streamer = new TextStreamer(tokenizer, {
      skip_prompt: true,
      skip_special_tokens: false,
      callback_function: (token: string) => {
        const value = token.replace(/<\|im_end\|>/g, '');
        if (value) {
          queue.push(value);
          if (resolveNext) {
            resolveNext();
            resolveNext = null;
          }
        }
      },
    });

    const generateTask = model.generate({
      ...input,
      past_key_values: this.pastKeyValues,
      max_new_tokens: 512,
      do_sample: false,
      streamer,
      return_dict_in_generate: true,
    })
      .then((result: any) => {
        if (options.measurePerformance) {
           const end = performance.now();
           const duration = (end - start) / 1000;
           const generatedTokens = result.sequences.dims[1] - input.input_ids.dims[1];
           console.log(`Generation stats:
             Duration: ${duration.toFixed(2)}s
             Tokens: ${generatedTokens}
             Tokens/sec: ${(generatedTokens / duration).toFixed(2)}
           `);
        }

        this.pastKeyValues = result.past_key_values;

        const finalResponse = tokenizer
          .batch_decode(result.sequences.slice(null, [input.input_ids.dims[1], null]), {
            skip_special_tokens: false,
          })[0]
          .replace(/<\|im_end\|>$/, '');

        isFinished = true;
        if (resolveNext) resolveNext(); // Wake up the final iteration

        return finalResponse;
      })
      .catch((err: Error) => {
        generationError = err;
        isFinished = true;
        if (resolveNext) resolveNext();
        throw err;
      });

    // --- Yield tokens as they arrive in the queue ---
    while (!isFinished || queue.length > 0) {
      if (queue.length > 0) {
        // Yield the next token in line
        yield queue.shift()!;
      } else {
        // Sleep until the next token arrives or generation finishes
        await new Promise<void>((resolve) => {
          resolveNext = resolve;
        });
      }
    }

    if (generationError) {
      throw generationError;
    }

    const response = await generateTask;
    return response;
  }

  parseToolCall(response: string): { name: string; args: any }[] | null {
    const fnCall = /<\|tool_call_start\|>\[(.*)\]<\|tool_call_end\|>/s;
    const match = response.match(fnCall);

    if (match) {
      const callsContent = match[1];
      const toolCalls: { name: string; args: any }[] = [];

      const functionRegex = /([a-zA-Z_]\w*)\s*\(([\s\S]*?)\)/g;

      let matchCall;
      // We need to match function calls carefully.
      // A simple regex might fail on nested parenthesis or strings containing ')'.
      // But let's assume one level of call for now without nested calls as arguments.
      // The issue with `[\s\S]*?` is it stops at the first `)`.
      // We need to parse manually or use a better regex.

      // Manual parsing approach for robustness
      let currentIndex = 0;
      while (currentIndex < callsContent.length) {
        // Find function name
        const nameMatch = callsContent.substring(currentIndex).match(/([a-zA-Z_]\w*)\s*\(/);
        if (!nameMatch) break;

        const name = nameMatch[1];
        const startIndex = currentIndex + nameMatch.index! + nameMatch[0].length;

        // Find closing parenthesis, respecting quotes
        let depth = 1;
        let inQuote: string | null = null;
        let endIndex = -1;

        for (let i = startIndex; i < callsContent.length; i++) {
          const char = callsContent[i];

          if (inQuote) {
            if (char === inQuote && callsContent[i - 1] !== '\\') {
              inQuote = null;
            }
          } else {
            if (char === '"' || char === "'") {
              inQuote = char;
            } else if (char === '(') {
              depth++;
            } else if (char === ')') {
              depth--;
              if (depth === 0) {
                endIndex = i;
                break;
              }
            }
          }
        }

        if (endIndex !== -1) {
          const argsStr = callsContent.substring(startIndex, endIndex);
          const args = this.parsePythonArgs(argsStr);
          toolCalls.push({ name, args });
          currentIndex = endIndex + 1;
        } else {
          break; // Malformed
        }
      }

      return toolCalls.length > 0 ? toolCalls : null;
    }

    return null;
  }

  executeToolCalls(
    response: string,
    handlers: { [toolName: string]: (args: any) => void }
  ): void {
    const toolCalls = this.parseToolCall(response);
    if (toolCalls) {
      for (const call of toolCalls) {
        if (handlers[call.name]) {
          handlers[call.name](call.args);
        }
      }
    }
  }

  private parsePythonArgs(argsStr: string): any {
    const args: any = {};
    let currentIndex = 0;

    while (currentIndex < argsStr.length) {
      // Find key
      const keyMatch = argsStr.substring(currentIndex).match(/([a-zA-Z_]\w*)\s*=/);
      if (!keyMatch) break;

      const key = keyMatch[1];
      const valueStartIndex = currentIndex + keyMatch.index! + keyMatch[0].length;

      // Find value ending (comma or end of string)
      let inQuote: string | null = null;
      let valueEndIndex = argsStr.length;

      for (let i = valueStartIndex; i < argsStr.length; i++) {
        const char = argsStr[i];
        if (inQuote) {
          if (char === inQuote && argsStr[i - 1] !== '\\') {
            inQuote = null;
          }
        } else {
          if (char === '"' || char === "'") {
            inQuote = char;
          } else if (char === ',') {
            valueEndIndex = i;
            break;
          }
        }
      }

      let valueStr = argsStr.substring(valueStartIndex, valueEndIndex).trim();

      // Parse value
      if ((valueStr.startsWith('"') && valueStr.endsWith('"')) ||
          (valueStr.startsWith("'") && valueStr.endsWith("'"))) {
        // String literal - simple unquote (handle escaped quotes?)
        // JSON.parse might work if we standardise quotes
        try {
            if (valueStr.startsWith("'")) {
                valueStr = '"' + valueStr.slice(1, -1).replace(/"/g, '\\"') + '"';
            }
            args[key] = JSON.parse(valueStr);
        } catch {
             args[key] = valueStr.slice(1, -1); // Fallback
        }
      } else if (valueStr === 'True') {
        args[key] = true;
      } else if (valueStr === 'False') {
        args[key] = false;
      } else if (!isNaN(Number(valueStr))) {
        args[key] = Number(valueStr);
      } else {
        args[key] = valueStr; // Fallback
      }

      args[key] = args[key];
      currentIndex = valueEndIndex + 1;
    }
    return args;
  }

  clearPastKeyValues(): void {
    this.pastKeyValues = null;
  }

  cleanup(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  ngOnDestroy(): void {
    this.cleanup();
  }
}
