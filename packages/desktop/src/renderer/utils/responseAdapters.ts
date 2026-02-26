import type { ProtocolResponse, Request } from '@apiquest/types';
import type { IProtocolPluginUI, SummaryLineComponent, SummaryField, RequestSummary } from '@apiquest/plugin-ui-types';

const DefaultSummaryLine: SummaryLineComponent = ({ request, response }) => {
  const summary = response?.summary;
  const status = summary?.code ?? summary?.label ?? summary?.message ?? 'Complete';
  const requestName = request?.name || '';
  return [requestName, status].filter(Boolean).join(' - ');
};

export interface ResponseSummaryView {
  statusLabel: string;
  statusDetail?: string;
  duration?: number;
  error?: string;
  outcome?: 'success' | 'error';
  code?: number | string;
  rawData?: unknown;
  summaryLine: SummaryLineComponent;
  fields?: SummaryField[];
  statusLevel?: RequestSummary['statusLevel'];
}

export function buildSummary(request: Request, response?: ProtocolResponse, pluginUI?: IProtocolPluginUI | null): ResponseSummaryView | null {
  const pluginSummary = pluginUI?.getSummary?.(request, response);
  const summary = response?.summary;

  return {
    statusLabel: summary?.code !== undefined ? String(summary.code) : (summary?.label || summary?.message || (response ? 'Complete' : 'Pending')),
    statusDetail: summary?.message && summary?.message !== summary?.label ? summary?.message : undefined,
    duration: summary?.duration,
    outcome: summary?.outcome,
    code: summary?.code,
    error: summary?.outcome === 'error' ? summary?.message : undefined,
    rawData: response?.data,
    summaryLine: pluginSummary?.summaryLine ?? DefaultSummaryLine,
    fields: pluginSummary?.fields,
    statusLevel: pluginSummary?.statusLevel
  };
}

export function buildResponseRaw(response: ProtocolResponse | null | undefined): unknown {
  if (!response) return null;
  return response.data ?? null;
}
