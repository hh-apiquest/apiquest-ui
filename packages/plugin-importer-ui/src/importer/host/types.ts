import type { Auth, Collection, CollectionItem, VariableValue } from '@apiquest/types';

export type ImportCollectionResult = Collection & { warnings?: string[] };

export type ScriptConversionMode = 'rule' | 'ai';

export type ImportConvertOptions = {
  convertScripts?: boolean;
  scriptConversionMode?: ScriptConversionMode;
  /**
   * When true, unconverted pm.* patterns in scripts produce converter warnings (default).
   * When false, they are silently skipped.
   * This is a converter option only — it does NOT affect the collection's strictMode.
   */
  strictScriptConversion?: boolean;
  /**
   * Controls the collection's runtime options.strictMode field.
   * strictMode = true (default): Conditional test declarations not allowed;
   *   tests wrapped in try/catch not allowed; deterministic test counting required.
   * strictMode = false: Conditional tests and dynamic test counts are allowed.
   */
  collectionStrictMode?: boolean;
  aiPrompt?: string;
};

export type PostmanDescription = string | { content?: string; type?: string; version?: unknown } | null;

export type PostmanCollection = {
  info?: { name?: string; description?: PostmanDescription; _postman_id?: string; _postman_schema?: string };
  item?: PostmanItem[];
  variable?: PostmanVariable[];
  auth?: PostmanAuth;
  event?: PostmanEvent[];
};

export type PostmanItem = {
  id?: string;
  name?: string;
  description?: PostmanDescription;
  item?: PostmanItem[];
  request?: PostmanRequest;
  event?: PostmanEvent[];
  auth?: PostmanAuth;
};

export type PostmanRequest = {
  method?: string;
  description?: PostmanDescription;
  header?: Array<{ key: string; value: string; disabled?: boolean; description?: string }>;
  body?: {
    mode?: string;
    raw?: string;
    options?: {
      raw?: {
        language?: string;
      };
    };
    urlencoded?: Array<{ key: string; value: string; disabled?: boolean; description?: string }>;
    formdata?: Array<{ key: string; value: string; type?: string; disabled?: boolean; description?: string }>;
  };
  url?:
    | string
    | {
        raw?: string;
        protocol?: string;
        host?: string | string[];
        path?: string | string[];
        query?: Array<{ key: string; value: string; disabled?: boolean; description?: string }>;
        variable?: Array<{ key: string; value: string }>;
      };
  auth?: PostmanAuth;
};

export type PostmanEvent = {
  listen: 'prerequest' | 'test';
  script?: { exec?: string | string[]; type?: string };
  disabled?: boolean;
};

export type PostmanAuth = {
  type: string;
  bearer?: Array<{ key: string; value: string }>;
  basic?: Array<{ key: string; value: string }>;
  apikey?: Array<{ key: string; value: string; in?: string }>;
  oauth2?: Array<{ key: string; value: string }>;
};

export type PostmanVariable = {
  key?: string;
  value?: unknown;
  description?: string;
  disabled?: boolean;
};

export type ConvertedHttpBody = {
  mode: 'none' | 'raw' | 'urlencoded' | 'formdata';
  raw?: string;
  language?: string;
  kv?: Array<{ key: string; value: string; type?: 'text' | 'binary'; description?: string }>;
};

export type ConvertedHttpData = {
  method: string;
  url: string;
  headers?: Record<string, string>;
  params?: Array<{ key: string; value: string; description?: string }>;
  body?: ConvertedHttpBody;
};

export type ConvertedRequestItem = Extract<CollectionItem, { type: 'request' }> & {
  data: ConvertedHttpData;
  auth?: Auth;
};

export type ConvertPayload = {
  data: string;
  format: string;
  options?: ImportConvertOptions;
};

export type VariableRecord = Record<string, VariableValue>;

