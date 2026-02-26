import type { ProtocolResponse, Request } from '@apiquest/types';
import type { ExecutionEvent } from '../../types/execution';
import type { ResponseSummaryView } from '../utils/responseAdapters';

export interface NetworkEntry {
  id: string;
  executionId: string;
  requestId?: string;
  requestName?: string;
  path?: string;
  protocol?: string;
  responseSummary?: ResponseSummaryView | null;
  startTime: number;
  endTime?: number;
  request?: Request;
  response?: ProtocolResponse;
  customEvents?: ExecutionEvent[];
  error?: string;
}

export interface NetworkState {
  entries: NetworkEntry[];
  maxEntries: number;
}
