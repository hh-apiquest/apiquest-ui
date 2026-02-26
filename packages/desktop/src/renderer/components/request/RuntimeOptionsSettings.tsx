import React from 'react';
import { Text, TextField, Checkbox, Button, Select } from '@radix-ui/themes';
import { TrashIcon } from '@heroicons/react/24/outline';
import type { RuntimeOptions, TimeoutOptions, SSLOptions, ProxyOptions, LogLevel } from '@apiquest/types';

interface RuntimeOptionsSettingsProps {
  options: RuntimeOptions | undefined;
  onChange: (options: RuntimeOptions | undefined) => void;
  protocol?: string; // For protocol-specific options
  resourceType?: 'request' | 'folder' | 'collection';
}

export function RuntimeOptionsSettings({ 
  options = {}, 
  onChange,
  protocol,
  resourceType = 'request'
}: RuntimeOptionsSettingsProps) {
  
  const updateOptions = (updates: Partial<RuntimeOptions>) => {
    const updated = { ...options, ...updates };
    // Clean up undefined/null values
    (Object.keys(updated) as Array<keyof RuntimeOptions>).forEach(key => {
      if (updated[key] === undefined || updated[key] === null) {
        delete updated[key];
      }
    });
    onChange(Object.keys(updated).length > 0 ? updated : undefined);
  };

  const updateTimeout = (field: keyof TimeoutOptions, value: string) => {
    const numValue = value ? parseInt(value, 10) : undefined;
    const timeout: TimeoutOptions = { ...options.timeout, [field]: numValue };
    // Clean up undefined values
    (Object.keys(timeout) as Array<keyof TimeoutOptions>).forEach(key => {
      if (timeout[key] === undefined) {
        delete timeout[key];
      }
    });
    updateOptions({
      timeout: Object.keys(timeout).length > 0 ? timeout : undefined
    });
  };

  const updateSSL = (updates: Partial<SSLOptions>) => {
    const ssl: Partial<SSLOptions> = { ...options.ssl, ...updates };
    (Object.keys(ssl) as Array<keyof SSLOptions>).forEach(key => {
      if (ssl[key] === undefined) {
        delete ssl[key];
      }
    });
    updateOptions({
      ssl: Object.keys(ssl).length > 0 ? ssl as SSLOptions : undefined
    });
  };

  const updateProxy = (updates: Partial<ProxyOptions>) => {
    const proxy: Partial<ProxyOptions> = { ...options.proxy, ...updates };
    (Object.keys(proxy) as Array<keyof ProxyOptions>).forEach(key => {
      if (proxy[key] === undefined) {
        delete proxy[key];
      }
    });
    updateOptions({
      proxy: Object.keys(proxy).length > 0 && proxy.enabled !== undefined
        ? proxy as ProxyOptions
        : undefined
    });
  };

  return (
    <div className="flex flex-col gap-6 px-2">
      
      {/* Timeouts */}
      <div className="flex flex-col gap-3">
        <Text size="2" weight="medium">Timeouts</Text>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label>
              <Text size="1" color="gray">Request Timeout (ms)</Text>
            </label>
            <TextField.Root
              type="number"
              placeholder="Default"
              value={options.timeout?.request ?? ''}
              onChange={(e) => updateTimeout('request', e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label>
              <Text size="1" color="gray">Connection Timeout (ms)</Text>
            </label>
            <TextField.Root
              type="number"
              placeholder="Default"
              value={options.timeout?.connection ?? ''}
              onChange={(e) => updateTimeout('connection', e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label>
              <Text size="1" color="gray">Response Timeout (ms)</Text>
            </label>
            <TextField.Root
              type="number"
              placeholder="Default"
              value={options.timeout?.response ?? ''}
              onChange={(e) => updateTimeout('response', e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Redirects */}
      <div className="flex flex-col gap-3">
        <Text size="2" weight="medium">Redirects</Text>
        <div className="flex items-center gap-3">
          <Checkbox
            checked={options.followRedirects ?? true}
            onCheckedChange={(checked) => 
              updateOptions({ followRedirects: checked === true })
            }
          />
          <Text size="2">Follow Redirects</Text>
        </div>
        {options.followRedirects !== false && (
          <div className="flex flex-col gap-1">
            <label>
              <Text size="1" color="gray">Max Redirects</Text>
            </label>
            <TextField.Root
              type="number"
              placeholder="5"
              value={options.maxRedirects ?? ''}
              onChange={(e) => updateOptions({ 
                maxRedirects: e.target.value ? parseInt(e.target.value, 10) : undefined 
              })}
              style={{ width: '200px' }}
            />
          </div>
        )}
      </div>

      {/* SSL/TLS */}
      <div className="flex flex-col gap-3">
        <Text size="2" weight="medium">SSL/TLS</Text>
        <div className="flex items-center gap-3">
          <Checkbox
            checked={options.ssl?.validateCertificates ?? true}
            onCheckedChange={(checked) => 
              updateSSL({ validateCertificates: checked === true })
            }
          />
          <Text size="2">Validate SSL Certificates</Text>
        </div>
        
        <details className="border-l-2 pl-3" style={{ borderColor: 'var(--gray-6)' }}>
          <summary className="cursor-pointer">
            <Text size="2" color="gray">Client Certificate (Advanced)</Text>
          </summary>
          <div className="flex flex-col gap-3 mt-3">
            <div className="flex flex-col gap-1">
              <label>
                <Text size="1" color="gray">Certificate Path</Text>
              </label>
              <TextField.Root
                placeholder="/path/to/cert.pem"
                value={options.ssl?.clientCertificate?.cert ?? ''}
                onChange={(e) => updateSSL({ 
                  clientCertificate: {
                    ...options.ssl?.clientCertificate,
                    cert: e.target.value,
                    key: options.ssl?.clientCertificate?.key ?? ''
                  }
                })}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label>
                <Text size="1" color="gray">Key Path</Text>
              </label>
              <TextField.Root
                placeholder="/path/to/key.pem"
                value={options.ssl?.clientCertificate?.key ?? ''}
                onChange={(e) => updateSSL({ 
                  clientCertificate: {
                    ...options.ssl?.clientCertificate,
                    cert: options.ssl?.clientCertificate?.cert ?? '',
                    key: e.target.value
                  }
                })}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label>
                <Text size="1" color="gray">Passphrase (Optional)</Text>
              </label>
              <TextField.Root
                type="password"
                placeholder="Passphrase"
                value={options.ssl?.clientCertificate?.passphrase ?? ''}
                onChange={(e) => updateSSL({ 
                  clientCertificate: {
                    ...options.ssl?.clientCertificate,
                    cert: options.ssl?.clientCertificate?.cert ?? '',
                    key: options.ssl?.clientCertificate?.key ?? '',
                    passphrase: e.target.value || undefined
                  }
                })}
              />
            </div>
          </div>
        </details>
      </div>

      {/* Proxy */}
      <div className="flex flex-col gap-3">
        <Text size="2" weight="medium">Proxy</Text>
        <div className="flex items-center gap-3">
          <Checkbox
            checked={options.proxy?.enabled ?? false}
            onCheckedChange={(checked) => 
              updateProxy({ 
                enabled: checked === true,
                host: options.proxy?.host || '',
                port: options.proxy?.port || 8080
              })
            }
          />
          <Text size="2">Enable Proxy</Text>
        </div>
        
        {options.proxy?.enabled && (
          <div className="flex flex-col gap-3 border-l-2 pl-3" style={{ borderColor: 'var(--gray-6)' }}>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label>
                  <Text size="1" color="gray">Host</Text>
                </label>
                <TextField.Root
                  placeholder="proxy.example.com"
                  value={options.proxy.host}
                  onChange={(e) => updateProxy({ host: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label>
                  <Text size="1" color="gray">Port</Text>
                </label>
                <TextField.Root
                  type="number"
                  placeholder="8080"
                  value={options.proxy.port}
                  onChange={(e) => updateProxy({ 
                    port: parseInt(e.target.value, 10) || 8080 
                  })}
                />
              </div>
            </div>
            
            <details>
              <summary className="cursor-pointer">
                <Text size="2" color="gray">Authentication (Optional)</Text>
              </summary>
              <div className="flex flex-col gap-3 mt-3">
                <div className="flex flex-col gap-1">
                  <label>
                    <Text size="1" color="gray">Username</Text>
                  </label>
                  <TextField.Root
                    placeholder="username"
                    value={options.proxy.auth?.username ?? ''}
                    onChange={(e) => updateProxy({ 
                      auth: {
                        username: e.target.value,
                        password: options.proxy?.auth?.password ?? ''
                      }
                    })}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label>
                    <Text size="1" color="gray">Password</Text>
                  </label>
                  <TextField.Root
                    type="password"
                    placeholder="password"
                    value={options.proxy.auth?.password ?? ''}
                    onChange={(e) => updateProxy({ 
                      auth: {
                        username: options.proxy?.auth?.username ?? '',
                        password: e.target.value
                      }
                    })}
                  />
                </div>
              </div>
            </details>
          </div>
        )}
      </div>

      {/* Log Level */}
      <div className="flex flex-col gap-3">
        <Text size="2" weight="medium">Logging</Text>
        <div className="flex flex-col gap-1">
          <label>
            <Text size="1" color="gray">Log Level</Text>
          </label>
          <Select.Root
            value={options.logLevel !== undefined ? String(options.logLevel) : undefined}
            onValueChange={(value) => updateOptions({
              logLevel: Number(value) as LogLevel
            })}
          >
            <Select.Trigger placeholder="Select log level" />
            <Select.Content>
              <Select.Item value="0">ERROR</Select.Item>
              <Select.Item value="1">WARN</Select.Item>
              <Select.Item value="2">INFO</Select.Item>
              <Select.Item value="3">DEBUG</Select.Item>
              <Select.Item value="4">TRACE</Select.Item>
            </Select.Content>
          </Select.Root>
        </div>
      </div>

      {/* Reset Button */}
      {options && Object.keys(options).length > 0 && (
        <div className="flex justify-end pt-3 border-t" style={{ borderColor: 'var(--gray-6)' }}>
          <Button
            variant="soft"
            color="gray"
            onClick={() => onChange(undefined)}
          >
            Reset to Defaults
          </Button>
        </div>
      )}
    </div>
  );
}
