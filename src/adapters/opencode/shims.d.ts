// Type shims for @opencode-ai/plugin used by the opencode adapter.
//
// The runtime adapter only references the SDK through the values injected
// by the host (the `client`, `$`, and optional `tui` parameters). We
// declare just enough types to type-check the plugin and its tests
// without taking a hard runtime dependency on @opencode-ai/plugin.

export type OpencodeClient = {
  session: {
    create?(parameters?: Record<string, unknown>): Promise<{ data?: { id?: string }; error?: unknown }>;
    get?(parameters: { sessionID: string }): Promise<{ data?: { id?: string; directory?: string }; error?: unknown }>;
    prompt?(parameters: {
      sessionID: string;
      parts?: Array<{ type?: string; text?: string; [key: string]: unknown }>;
      [key: string]: unknown;
    }): Promise<{ data?: unknown; error?: unknown }>;
    messages?(parameters: { sessionID: string }): Promise<{ data?: Array<Record<string, unknown>>; error?: unknown }>;
    status?(parameters?: { sessionID?: string }): Promise<{ data?: Record<string, unknown>; error?: unknown }>;
    abort?(parameters: { sessionID: string }): Promise<{ data?: unknown; error?: unknown }>;
    update?(parameters: { sessionID: string; title?: string }): Promise<{ data?: unknown; error?: unknown }>;
  };
  app?: {
    log?(input: { level?: string; message: string; extra?: Record<string, unknown> }): Promise<void>;
  };
};

export type OpencodeShell = ((strings: TemplateStringsArray, ...values: unknown[]) => Promise<{ stdout: string; stderr: string; exitCode: number }>) & {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<{ stdout: string; stderr: string; exitCode: number }>;
};

export type OpencodePluginInput = {
  client: OpencodeClient;
  project: { id?: string; worktree?: string; directory?: string; [key: string]: unknown };
  directory: string;
  worktree: string;
  serverUrl: URL;
  $: OpencodeShell;
  tui?: {
    command: {
      register(cb: () => Array<{
        title: string;
        value: string;
        description?: string;
        category?: string;
        slash?: { name: string; aliases?: string[] };
        onSelect?: () => void;
      }>): () => void;
      trigger(value: string): void;
      show(): void;
    };
  };
};

export type OpencodePluginEvent =
  | { type: "session.created"; properties?: { sessionID?: string; info?: { id?: string; directory?: string } } }
  | { type: "session.idle"; properties?: { sessionID?: string } }
  | { type: "session.error"; properties?: { sessionID?: string; error?: unknown } }
  | { type: "session.compacted"; properties?: { sessionID?: string } }
  | { type: "message.part.updated"; properties?: { sessionID?: string; part?: Record<string, unknown> } }
  | { type: string; [key: string]: unknown };

export type OpencodePluginHooks = {
  event?: (input: { event: OpencodePluginEvent }) => Promise<void>;
  "command.execute.before"?: (input: { command: string; sessionID: string; arguments: string }) => Promise<void>;
  "tool.execute.before"?: (
    input: { tool: string; sessionID: string; callID: string },
    output: { args: unknown }
  ) => Promise<void>;
  "tool.execute.after"?: (
    input: { tool: string; sessionID: string; callID: string; args: unknown },
    output: { title: string; output: string; metadata: unknown }
  ) => Promise<void>;
  "experimental.chat.messages.transform"?: (
    input: Record<string, never>,
    output: { messages: Array<{ info: Record<string, unknown>; parts: Array<Record<string, unknown>> }> }
  ) => Promise<void>;
  "experimental.chat.system.transform"?: (
    input: { sessionID?: string },
    output: { system: string[] }
  ) => Promise<void>;
  tool?: Record<string, unknown>;
};

export type OpencodePlugin = (input: OpencodePluginInput) => Promise<OpencodePluginHooks>;
export type OpencodeTuiPlugin = (input: OpencodePluginInput) => Promise<OpencodePluginHooks>;
export type OpencodePluginModule = {
  id?: string;
  server?: OpencodePlugin;
  tui?: OpencodeTuiPlugin;
};

declare module "@opencode-ai/plugin" {
  export type OpencodeClient = {
    session: {
      create?(parameters?: Record<string, unknown>): Promise<{ data?: { id?: string }; error?: unknown }>;
      get?(parameters: { sessionID: string }): Promise<{ data?: { id?: string; directory?: string }; error?: unknown }>;
      prompt?(parameters: {
        sessionID?: string;
        body?: { model?: { providerID: string; modelID: string }; parts?: Array<{ type?: string; text?: string; [key: string]: unknown }>; [key: string]: unknown };
        parts?: Array<{ type?: string; text?: string; [key: string]: unknown }>;
        [key: string]: unknown;
      }): Promise<{ data?: unknown; error?: unknown }>;
      messages?(parameters: { sessionID: string }): Promise<{ data?: Array<Record<string, unknown>>; error?: unknown }>;
      status?(parameters?: { sessionID?: string }): Promise<{ data?: Record<string, unknown>; error?: unknown }>;
      abort?(parameters: { sessionID: string }): Promise<{ data?: unknown; error?: unknown }>;
      update?(parameters: { sessionID: string; title?: string; [key: string]: unknown }): Promise<{ data?: unknown; error?: unknown }>;
    };
    app?: {
      log?(input: { level?: string; message: string; extra?: Record<string, unknown> }): Promise<void>;
    };
  };

  export type OpencodeShell = ((strings: TemplateStringsArray, ...values: unknown[]) => Promise<{ stdout: string; stderr: string; exitCode: number }>) & {
    (strings: TemplateStringsArray, ...values: unknown[]): Promise<{ stdout: string; stderr: string; exitCode: number }>;
  };

  export type OpencodePluginInput = {
    client: OpencodeClient;
    project: { id?: string; worktree?: string; directory?: string; [key: string]: unknown };
    directory: string;
    worktree: string;
    serverUrl: URL;
    $: OpencodeShell;
    /** Optional model of the active opencode session (providerID/modelID). */
    model?: { providerID?: string; providerId?: string; modelID?: string; modelId?: string; id?: string } | string;
    /** Optional TUI API — present only when running in TUI mode. */
    tui?: {
      command: {
        register(cb: () => Array<{
          title: string;
          value: string;
          description?: string;
          category?: string;
          slash?: { name: string; aliases?: string[] };
          onSelect?: () => void;
        }>): () => void;
        trigger(value: string): void;
        show(): void;
      };
    };
  };

  export type OpencodePluginEvent =
    | { type: "session.created"; properties?: { sessionID?: string; info?: { id?: string; directory?: string } } }
    | { type: "session.idle"; properties?: { sessionID?: string } }
    | { type: "session.error"; properties?: { sessionID?: string; error?: unknown } }
    | { type: "session.compacted"; properties?: { sessionID?: string } }
    | { type: "message.part.updated"; properties?: { sessionID?: string; part?: Record<string, unknown> } }
    | { type: string; [key: string]: unknown };

  export type OpencodePluginHooks = {
    event?: (input: { event: OpencodePluginEvent }) => Promise<void>;
    "command.execute.before"?: (input: { command: string; sessionID: string; arguments: string }) => Promise<void>;
    "tool.execute.before"?: (
      input: { tool: string; sessionID: string; callID: string },
      output: { args: unknown }
    ) => Promise<void>;
    "tool.execute.after"?: (
      input: { tool: string; sessionID: string; callID: string; args: unknown },
      output: { title: string; output: string; metadata: unknown }
    ) => Promise<void>;
    "experimental.chat.messages.transform"?: (
      input: Record<string, never>,
      output: { messages: Array<{ info: Record<string, unknown>; parts: Array<Record<string, unknown>> }> }
    ) => Promise<void>;
    "experimental.chat.system.transform"?: (
      input: { sessionID?: string },
      output: { system: string[] }
    ) => Promise<void>;
    tool?: Record<string, unknown>;
  };

  export type OpencodePlugin = (input: OpencodePluginInput) => Promise<OpencodePluginHooks>;
  export type OpencodeTuiPlugin = (input: OpencodePluginInput) => Promise<OpencodePluginHooks>;
  export type OpencodePluginModule = {
    id?: string;
    server?: OpencodePlugin;
    tui?: OpencodeTuiPlugin;
  };
}
