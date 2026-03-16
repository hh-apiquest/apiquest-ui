import type {
  HeaderEntry,
  HeadersEditorState,
  ParamEntry,
  ParamsEditorState,
} from '@apiquest/plugin-ui-types';
import type { HttpBodyKV, HttpRequestData } from '@apiquest/plugin-http';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

export const HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];

type RadixAccentColor =
  | 'gray'
  | 'gold'
  | 'bronze'
  | 'brown'
  | 'yellow'
  | 'amber'
  | 'orange'
  | 'tomato'
  | 'red'
  | 'ruby'
  | 'crimson'
  | 'pink'
  | 'plum'
  | 'purple'
  | 'violet'
  | 'iris'
  | 'indigo'
  | 'blue'
  | 'cyan'
  | 'teal'
  | 'jade'
  | 'green'
  | 'grass'
  | 'lime'
  | 'mint'
  | 'sky';

export const methodToColor: Record<HttpMethod, RadixAccentColor> = {
  GET: 'grass',
  POST: 'amber',
  PUT: 'blue',
  DELETE: 'red',
  PATCH: 'purple',
  HEAD: 'jade',
  OPTIONS: 'yellow',
};

export type UIFormDataKV = HttpBodyKV & { disabled?: boolean };
export type UIUrlEncodedKV = Omit<HttpBodyKV, 'type'> & { disabled?: boolean };

export interface HttpTransientUiState {
  paramsRows?: ParamEntry[];
  paramsEditorState?: ParamsEditorState;
  headersRows?: HeaderEntry[];
  headersEditorState?: HeadersEditorState;
  formdataRows?: UIFormDataKV[];
  urlencodedRows?: UIUrlEncodedKV[];
}

export type HttpRequestWithUiData = HttpRequestData & { _ui?: HttpTransientUiState };

export interface ParsedCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: string;
  maxAge?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: string;
}

