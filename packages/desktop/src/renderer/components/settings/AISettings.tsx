import React from 'react';
import { Text, TextField, Switch, Button, Flex, Box } from '@radix-ui/themes';
import { useSettings } from '../../contexts';

export function AISettings() {
  const { settings, update } = useSettings();

  const [enabled, setEnabled] = React.useState<boolean>(settings?.ai?.enabled ?? false);
  const [baseUrl, setBaseUrl] = React.useState<string>(settings?.ai?.baseUrl ?? '');
  const [apiKey, setApiKey] = React.useState<string>(settings?.ai?.apiKey ?? '');
  const [model, setModel] = React.useState<string>(settings?.ai?.model ?? 'gpt-4o-mini');
  const [timeoutMs, setTimeoutMs] = React.useState<string>(String(settings?.ai?.timeoutMs ?? 30000));
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => {
    setEnabled(settings?.ai?.enabled ?? false);
    setBaseUrl(settings?.ai?.baseUrl ?? '');
    setApiKey(settings?.ai?.apiKey ?? '');
    setModel(settings?.ai?.model ?? 'gpt-5');
    setTimeoutMs(String(settings?.ai?.timeoutMs ?? 30000));
  }, [settings?.ai?.enabled, settings?.ai?.baseUrl, settings?.ai?.apiKey, settings?.ai?.model, settings?.ai?.timeoutMs]);

  const parsedTimeout = Number(timeoutMs);
  const timeoutIsValid = Number.isFinite(parsedTimeout) && parsedTimeout > 0;

  const isDirty =
    enabled !== (settings?.ai?.enabled ?? false) ||
    baseUrl !== (settings?.ai?.baseUrl ?? '') ||
    apiKey !== (settings?.ai?.apiKey ?? '') ||
    model !== (settings?.ai?.model ?? 'gpt-5') ||
    timeoutMs !== String(settings?.ai?.timeoutMs ?? 30000);

  const handleSave = async () => {
    if (!timeoutIsValid) return;

    setSaving(true);
    setSaved(false);
    try {
      await update({
        ai: {
          enabled,
          baseUrl: baseUrl.trim(),
          apiKey: apiKey.trim(),
          model: model.trim(),
          timeoutMs: parsedTimeout,
        }
      });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1500);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box>
      <Text size="4" weight="medium">AI Settings</Text>
      <Text size="2" color="gray" style={{ display: 'block', marginTop: '4px' }}>
        Configure global OpenAI-compatible settings. Plugins inherit this configuration and cannot override endpoint or API key.
      </Text>

      <Flex direction="column" gap="4" mt="4" style={{ maxWidth: 720 }}>
        <Flex align="center" justify="between">
          <Text size="2" weight="medium">Enable AI-assisted conversion</Text>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </Flex>

        <label>
          <Text size="2" weight="medium">Base URL</Text>
          <TextField.Root
            mt="1"
            placeholder="https://api.openai.com"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
          />
        </label>

        <label>
          <Text size="2" weight="medium">API Key</Text>
          <TextField.Root
            mt="1"
            type="password"
            placeholder="sk-..."
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </label>

        <label>
          <Text size="2" weight="medium">Model</Text>
          <TextField.Root
            mt="1"
            placeholder="gpt-4o-mini"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          />
        </label>

        <label>
          <Text size="2" weight="medium">Timeout (ms)</Text>
          <TextField.Root
            mt="1"
            placeholder="30000"
            value={timeoutMs}
            onChange={(e) => setTimeoutMs(e.target.value)}
            color={timeoutIsValid ? undefined : 'red'}
          />
        </label>

        {!timeoutIsValid && (
          <Text size="1" color="red">Timeout must be a positive number.</Text>
        )}

        <Flex gap="2" justify="end">
          <Button
            variant="soft"
            color="gray"
            onClick={() => {
              setEnabled(settings?.ai?.enabled ?? false);
              setBaseUrl(settings?.ai?.baseUrl ?? '');
              setApiKey(settings?.ai?.apiKey ?? '');
              setModel(settings?.ai?.model ?? 'gpt-4o-mini');
              setTimeoutMs(String(settings?.ai?.timeoutMs ?? 30000));
            }}
            disabled={saving || !isDirty}
          >
            Reset
          </Button>
          <Button onClick={handleSave} disabled={saving || !isDirty || !timeoutIsValid}>
            {saving ? 'Saving...' : saved ? 'Saved' : 'Save'}
          </Button>
        </Flex>
      </Flex>
    </Box>
  );
}

