import React from 'react';
import type {
  IProtocolPluginUI,
  UITab,
  RequestBadge,
  ResponseUITab,
  RequestSummary,
  ScriptIntellisenseContext,
  ScriptIntellisense,
  PluginUIContext,
} from '@apiquest/plugin-ui-types';
import httpRequestDecl from '@apiquest/plugin-http/dist/scriptDeclarations.request.d.ts?raw';
import httpResponseDecl from '@apiquest/plugin-http/dist/scriptDeclarations.response.d.ts?raw';
import type { Request, ProtocolResponse } from '@apiquest/types';
import type { HttpResponseData } from '@apiquest/plugin-http';

import { UrlBox } from './components/RequestAddressBar';
import { HttpParamsTab, HttpHeadersTab, HttpBodyTab } from './components/RequestTabs';
import { HttpResponseBodyTab, HttpResponseHeadersTab, HttpResponseCookiesTab } from './components/ResponseTabs';
import { HttpSummaryLine, HttpDetailView } from './components/HttpViews';
import { ensureHttpMethod, toHttpRequestData } from './utils/httpUi';
import { methodToColor } from './types';

export const httpPluginUI: IProtocolPluginUI = {
  protocol: 'http',

  setup(_uiContext: PluginUIContext): void {
    // No-op for now. Plugin UI components receive full context via props.
  },

  createNewRequest(name: string): Request {
    return {
      type: 'request',
      id: `req-${Date.now()}`,
      name,
      data: {
        method: 'GET',
        url: '',
        headers: {},
        params: [],
        body: { mode: 'none' },
      },
    };
  },

  getRequestBadge(request: Request): RequestBadge {
    const data = toHttpRequestData(request.data);
    const method = ensureHttpMethod(data.method);

    return {
      primary: method,
      color: methodToColor[method],
    };
  },

  getSummary(_request: Request, response?: ProtocolResponse): RequestSummary {
    const httpData = response?.data as HttpResponseData | undefined;
    const status = httpData?.status ?? 0;
    const statusText = httpData?.statusText ?? '';
    const duration = response?.summary?.duration ?? 0;

    let statusLevel: RequestSummary['statusLevel'] = 'info';
    if (status >= 200 && status < 300) {
      statusLevel = 'success';
    } else if (status >= 300 && status < 400) {
      statusLevel = 'warning';
    } else if (status >= 400) {
      statusLevel = 'error';
    }

    return {
      summaryLine: HttpSummaryLine,
      detailView: HttpDetailView,
      statusLevel,
      fields: [
        { name: 'status', value: status },
        { name: 'statusText', value: statusText },
        { name: 'duration', value: duration, order: 1 },
      ],
      sortKey: status,
    };
  },

  renderAddressBar(request: Request, onChange: (request: Request) => void): React.ReactNode {
    return <UrlBox request={request} onChange={onChange} />;
  },

  getRequestTabs(): UITab[] {
    return [
      { id: 'params', label: 'Params', position: 10, component: HttpParamsTab },
      { id: 'headers', label: 'Headers', position: 20, component: HttpHeadersTab },
      { id: 'body', label: 'Body', position: 30, component: HttpBodyTab },
    ];
  },

  getResponseTabs(): ResponseUITab[] {
    return [
      { id: 'body', label: 'Body', position: 10, component: HttpResponseBodyTab },
      { id: 'headers', label: 'Headers', position: 20, component: HttpResponseHeadersTab },
      { id: 'cookies', label: 'Cookies', position: 30, component: HttpResponseCookiesTab },
    ];
  },

  getScriptIntellisense(context: ScriptIntellisenseContext): ScriptIntellisense[] {
    const { phase } = context;

    if (
      phase === 'folder-pre' ||
      phase === 'folder-post' ||
      phase === 'collection-pre' ||
      phase === 'collection-post'
    ) {
      return [];
    }

    if (phase === 'pre-request') {
      return [{ content: httpRequestDecl, uri: 'ts:quest-http-request.d.ts' }];
    }

    if (phase === 'post-request') {
      return [
        { content: httpRequestDecl, uri: 'ts:quest-http-request.d.ts' },
        { content: httpResponseDecl, uri: 'ts:quest-http-response.d.ts' },
      ];
    }

    return [];
  },
};

export default httpPluginUI;
