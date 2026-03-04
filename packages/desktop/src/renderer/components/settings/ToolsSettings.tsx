import React from 'react';
import { Text, TextField, Button, Spinner } from '@radix-ui/themes';
import {
  CheckCircleIcon,
  XCircleIcon
} from '@heroicons/react/24/outline';
import { useSettings } from '../../contexts';

interface ToolStatus {
  label: string;
  version: string | null;
  checked: boolean;
}

export function ToolsSettings() {
  const { settings, update } = useSettings();

  const [gitPath, setGitPath] = React.useState<string>(settings?.tools?.gitPath ?? '');
  const [toolStatus, setToolStatus] = React.useState<{ npm: ToolStatus; git: ToolStatus } | null>(null);
  const [checking, setChecking] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  const handleCheckTools = async () => {
    setChecking(true);
    try {
      const result = await window.quest.plugins.checkTools();
      setToolStatus({
        npm: { label: 'npm (bundled)', version: result.npm, checked: true },
        git: { label: 'git', version: result.git, checked: true }
      });
    } catch (err) {
      console.error('Failed to check tools:', err);
    } finally {
      setChecking(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await update({ tools: { gitPath: gitPath.trim(), npmPath: settings?.tools?.npmPath ?? '' } });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('Failed to save tool settings:', err);
    } finally {
      setSaving(false);
    }
  };

  const isDirty = gitPath !== (settings?.tools?.gitPath ?? '');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '600px' }}>
      <div>
        <Text size="4" weight="medium">Tools Configuration</Text>
        <Text size="2" color="gray" style={{ display: 'block', marginTop: '4px' }}>
          Configure paths to external tools used by ApiQuest. Leave fields empty to use system defaults.
        </Text>
      </div>

      {/* npm section - informational only, path is a future feature */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <Text size="2" weight="medium">npm</Text>
          <Text size="1" color="gray">
            ApiQuest bundles its own npm CLI for plugin installation. No system npm is required.
            The bundled npm runs using Electron's built-in Node.js runtime.
          </Text>
        </div>
        <div
          style={{
            padding: '10px 12px',
            background: 'var(--green-3)',
            border: '1px solid var(--green-6)',
            borderRadius: '6px',
            fontSize: '12px',
            color: 'var(--green-11)',
            fontWeight: 500
          }}
        >
          Bundled npm is always used for plugin management.
        </div>
      </div>

      {/* git path */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <Text size="2" weight="medium">Git executable path</Text>
          <Text size="1" color="gray">
            Path to the git binary. Leave empty to use git from the system PATH.
            Example: <code style={{ fontFamily: 'monospace', fontSize: '11px' }}>C:\Program Files\Git\bin\git.exe</code> or <code style={{ fontFamily: 'monospace', fontSize: '11px' }}>/usr/local/bin/git</code>
          </Text>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <TextField.Root
            value={gitPath}
            onChange={(e) => setGitPath(e.target.value)}
            placeholder="Leave empty to use system PATH"
            style={{ flex: 1 }}
            size="2"
          />
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button
            size="1"
            variant="soft"
            onClick={handleSave}
            disabled={!isDirty || saving}
          >
            {saving ? <Spinner size="1" /> : null}
            {saved ? 'Saved' : 'Save'}
          </Button>
          {isDirty && (
            <Button
              size="1"
              variant="ghost"
              color="gray"
              onClick={() => setGitPath(settings?.tools?.gitPath ?? '')}
            >
              Discard
            </Button>
          )}
        </div>
      </div>

      {/* Tool status check */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', borderTop: '1px solid var(--gray-5)', paddingTop: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text size="2" weight="medium">Tool Status</Text>
          <Button size="1" variant="soft" onClick={handleCheckTools} disabled={checking}>
            {checking ? <Spinner size="1" /> : null}
            {checking ? 'Checking...' : 'Check now'}
          </Button>
        </div>

        {toolStatus && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {([toolStatus.npm, toolStatus.git] as ToolStatus[]).map((tool) => (
              <div
                key={tool.label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 10px',
                  background: tool.version ? 'var(--green-3)' : 'var(--red-3)',
                  border: `1px solid ${tool.version ? 'var(--green-6)' : 'var(--red-6)'}`,
                  borderRadius: '6px'
                }}
              >
                {tool.version ? (
                  <CheckCircleIcon style={{ width: '14px', height: '14px', color: 'var(--green-9)', flexShrink: 0 }} />
                ) : (
                  <XCircleIcon style={{ width: '14px', height: '14px', color: 'var(--red-9)', flexShrink: 0 }} />
                )}
                <div style={{ flex: 1 }}>
                  <Text size="2" weight="medium" style={{ color: tool.version ? 'var(--green-11)' : 'var(--red-11)' }}>
                    {tool.label}
                  </Text>
                  <Text size="1" color="gray" style={{ display: 'block' }}>
                    {tool.version ?? 'Not found'}
                  </Text>
                </div>
              </div>
            ))}
          </div>
        )}

        {!toolStatus && (
          <Text size="1" color="gray">
            Click "Check now" to verify that the required tools are available.
          </Text>
        )}
      </div>
    </div>
  );
}
