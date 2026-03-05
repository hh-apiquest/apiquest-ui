import { loader } from '@monaco-editor/react';
import type { ScriptIntellisense, ScriptIntellisenseContext } from '@apiquest/plugin-ui-types';

// Base quest global declarations — embedded at build time by Vite ?raw
import baseDeclarations from '@apiquest/fracture/dist/scriptDeclarations.d.ts?raw';

interface LibDisposable {
  dispose(): void;
}

interface IntellisenseContextOptions {
  canEventHaveTests?: boolean;
  protocolHasTestableEvents?: boolean;
}

interface BaseDeclarationSegments {
  core: string;
  tests: string;
  preRequestHints: string;
}

function splitBaseDeclarations(raw: string): BaseDeclarationSegments {
  const testSignatures = [
    'test(name: string, fn: () => void | Promise<void>): void;',
    'skip(name: string, fn: () => void | Promise<void>): void;',
    'fail(message?: string): void;',
  ];
  const preRequestHintSignatures = [
    'expectMessages(count: number): void;',
  ];

  const questBlockRegex = /declare const quest:\s*\{[\s\S]*?\n\};/;
  const questBlock = raw.match(questBlockRegex)?.[0];

  if (!questBlock) {
    // Safe fallback: keep existing behavior if format unexpectedly changes.
    return { core: raw, tests: '', preRequestHints: '' };
  }

  const questLines = questBlock.split('\n');
  const filteredQuestLines = questLines.filter((line) => {
    const trimmed = line.trim();
    return !testSignatures.includes(trimmed) && !preRequestHintSignatures.includes(trimmed);
  });

  const coreQuestBlock = filteredQuestLines
    .join('\n')
    .replace(/^declare const quest:\s*\{/, 'declare interface QuestApi {')
    .replace(/\n\};$/, '\n}\ndeclare const quest: QuestApi;');

  const core = raw.replace(questBlockRegex, coreQuestBlock);

  const tests = [
    'declare interface QuestApi {',
    '  test(name: string, fn: () => void | Promise<void>): void;',
    '  skip(name: string, fn: () => void | Promise<void>): void;',
    '  fail(message?: string): void;',
    '}',
  ].join('\n');

  const preRequestHints = [
    'declare interface QuestApi {',
    '  expectMessages(count: number): void;',
    '}',
  ].join('\n');

  return { core, tests, preRequestHints };
}

/**
 * Manages Monaco JavaScript IntelliSense for script editors.
 *
 * Responsibilities:
 * - Register the base quest/expect/signal/require globals once on init.
 * - Swap protocol-specific declarations when the active script editor context changes.
 * - Dispose stale libs before registering new ones to keep Monaco clean.
 *
 * Usage:
 *   const manager = new ScriptIntellisenseManager();
 *   await manager.initialize();
 *   manager.setContext(context, contributions);
 */
export class ScriptIntellisenseManager {
  private baseLibs: LibDisposable[] = [];
  private protocolLibs: LibDisposable[] = [];
  private initialized = false;
  private readonly baseSegments = splitBaseDeclarations(baseDeclarations);

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const monaco = await loader.init();

      // Configure JavaScript IntelliSense mode for script editors
      monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
        allowNonTsExtensions: true,
        target: monaco.languages.typescript.ScriptTarget.ES2020,
        lib: ['es2020'],
        noSemanticValidation: false,
        noSyntaxValidation: false,
      });

      // Register base quest globals — always present regardless of protocol
      const baseLib = monaco.languages.typescript.javascriptDefaults.addExtraLib(
        this.baseSegments.core,
        'ts:quest-base-core.d.ts'
      );
      this.baseLibs.push(baseLib);

      this.initialized = true;
    } catch (error) {
      console.error('[ScriptIntellisense] Failed to initialize:', error);
    }
  }

  /**
   * Set the active script editor context and apply protocol-specific declarations.
   * Disposes any previously registered protocol libs before adding new ones.
   *
   * @param context  The script editor context (protocol, owner type, phase, event name).
   * @param contributions  Protocol-specific declarations from the active protocol plugin.
   *                       Pass an empty array if the protocol provides no contributions.
   */
  setContext(
    context: ScriptIntellisenseContext,
    contributions: ScriptIntellisense[],
    options?: IntellisenseContextOptions
  ): void {
    this.disposeProtocolLibs();

    loader.init().then((monaco) => {
      if (this.shouldEnableTestApi(context, options)) {
        try {
          const testLib = monaco.languages.typescript.javascriptDefaults.addExtraLib(
            this.baseSegments.tests,
            'ts:quest-base-tests.d.ts'
          );
          this.protocolLibs.push(testLib);
        } catch (error) {
          console.error('[ScriptIntellisense] Failed to register base tests lib:', error);
        }
      }

      if (this.shouldEnablePreRequestHintApi(context, options)) {
        try {
          const preRequestHintsLib = monaco.languages.typescript.javascriptDefaults.addExtraLib(
            this.baseSegments.preRequestHints,
            'ts:quest-base-pre-request-hints.d.ts'
          );
          this.protocolLibs.push(preRequestHintsLib);
        } catch (error) {
          console.error('[ScriptIntellisense] Failed to register base pre-request hints lib:', error);
        }
      }

      for (const contribution of contributions) {
        try {
          const lib = monaco.languages.typescript.javascriptDefaults.addExtraLib(
            contribution.content,
            contribution.uri
          );
          this.protocolLibs.push(lib);
        } catch (error) {
          console.error(`[ScriptIntellisense] Failed to register lib ${contribution.uri}:`, error);
        }
      }
    }).catch((error) => {
      console.error('[ScriptIntellisense] Monaco init failed during setContext:', error);
    });
  }

  /**
   * Re-apply the current context after a plugin reload.
   * Call this when plugins are reloaded and contributions may have changed.
   */
  refresh(context: ScriptIntellisenseContext, contributions: ScriptIntellisense[]): void {
    this.setContext(context, contributions);
  }

  private shouldEnableTestApi(
    context: ScriptIntellisenseContext,
    options?: IntellisenseContextOptions
  ): boolean {
    if (context.ownerType === 'request' && context.phase === 'post-request') {
      return true;
    }

    if (context.phase === 'plugin-event') {
      return options?.canEventHaveTests === true;
    }

    return false;
  }

  private shouldEnablePreRequestHintApi(
    context: ScriptIntellisenseContext,
    options?: IntellisenseContextOptions
  ): boolean {
    return (
      context.ownerType === 'request'
      && context.phase === 'pre-request'
      && options?.protocolHasTestableEvents === true
    );
  }

  private disposeProtocolLibs(): void {
    for (const lib of this.protocolLibs) {
      try {
        lib.dispose();
      } catch {
        // Ignore disposal errors
      }
    }
    this.protocolLibs = [];
  }

  dispose(): void {
    this.disposeProtocolLibs();
    for (const lib of this.baseLibs) {
      try {
        lib.dispose();
      } catch {
        // Ignore disposal errors
      }
    }
    this.baseLibs = [];
    this.initialized = false;
  }
}
