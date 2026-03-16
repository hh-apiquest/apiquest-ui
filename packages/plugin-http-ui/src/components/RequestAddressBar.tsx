import React from 'react';
import * as RT from '@radix-ui/themes';
import { CheckIcon } from '@heroicons/react/20/solid';
import type { Request } from '@apiquest/types';

import { ensureHttpMethod, toHttpRequestData, toRequestWithData } from '../utils/httpUi';
import type { HttpMethod } from '../types';
import { HTTP_METHODS, methodToColor } from '../types';

function MethodSelect({
  method,
  onChange,
}: {
  method: HttpMethod;
  onChange: (method: HttpMethod) => void;
}): React.ReactElement {
  const color = methodToColor[method];

  return (
    <RT.Select.Root value={method} onValueChange={(value: string): void => onChange(ensureHttpMethod(value))} size="2">
      <RT.Select.Trigger
        variant="soft"
        color={color}
        style={{
          minWidth: 130,
          borderRadius: 0,
          height: '100%',
          justifyContent: 'space-between',
        }}
      />
      <RT.Select.Content style={{ minWidth: 160 }} position="popper" side="bottom" align="start">
        {HTTP_METHODS.map((httpMethod: HttpMethod) => (
          <RT.Select.Item key={httpMethod} value={httpMethod}>
            <RT.Flex align="center" justify="between" gap="3" style={{ width: '100%' }}>
              <RT.Badge color={methodToColor[httpMethod]} variant="soft">
                {httpMethod}
              </RT.Badge>
              {httpMethod === method ? (
                <CheckIcon style={{ width: 16, height: 16, opacity: 0.8 }} />
              ) : null}
            </RT.Flex>
          </RT.Select.Item>
        ))}
      </RT.Select.Content>
    </RT.Select.Root>
  );
}

export function UrlBox({
  request,
  onChange,
}: {
  request: Request;
  onChange: (request: Request) => void;
}): React.ReactElement {
  const data = toHttpRequestData(request.data);
  const method = ensureHttpMethod(data.method);
  const url = data.url ?? '';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'stretch',
        width: '100%',
        height: 32,
        border: '1px solid var(--gray-7)',
        borderRadius: 6,
        overflow: 'hidden',
        background: 'var(--color-background)',
      }}
    >
      <div style={{ borderRight: '1px solid var(--gray-7)', display: 'flex' }}>
        <MethodSelect
          method={method}
          onChange={(nextMethod: HttpMethod): void => {
            onChange(
              toRequestWithData(request, {
                ...data,
                method: nextMethod,
              })
            );
          }}
        />
      </div>
      <div style={{ flex: 1, display: 'flex' }}>
        <RT.TextField.Root
          value={url}
          onChange={(event: React.ChangeEvent<HTMLInputElement>): void => {
            onChange(
              toRequestWithData(request, {
                ...data,
                url: event.target.value,
              })
            );
          }}
          placeholder="Enter URL"
          size="2"
          variant="surface"
          style={{
            flex: 1,
            border: 'none',
            borderRadius: 0,
            height: '100%',
          }}
        />
      </div>
    </div>
  );
}

