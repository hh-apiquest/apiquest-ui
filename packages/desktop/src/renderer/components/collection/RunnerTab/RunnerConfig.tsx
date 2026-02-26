// RunnerConfig - Configuration panel for collection runner
import { TextField, Select, Checkbox } from '@radix-ui/themes';
import { useWorkspace } from '../../../contexts';

interface RunnerConfigProps {
  config: {
    environmentId?: string;
    iterations: number;
    delay: number;
    parallel: boolean;
    concurrency: number;
    allowParallel: boolean;
    maxConcurrency?: number;
    dataFile?: File | null;
    persistVariables: boolean;
    saveResponses: boolean;
  };
  onChange: (config: any) => void;
}

export function RunnerConfig({ config, onChange }: RunnerConfigProps) {
  const { workspace } = useWorkspace();
  const environments = workspace?.environments || [];
  
  // Disable delay when parallel mode is enabled with concurrency > 1
  const isParallel = config.parallel && config.concurrency > 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <h3 style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>Configuration</h3>
      
      {/* Environment Selector */}
      <div>
        <label style={{ fontSize: '12px', fontWeight: 500, display: 'block', marginBottom: '6px', color: 'var(--gray-12)' }}>
          Environment
        </label>
        <Select.Root
          value={config.environmentId || 'none'}
          onValueChange={(value) => onChange({
            ...config,
            environmentId: value === 'none' ? undefined : value
          })}
          size="2"
        >
          <Select.Trigger style={{ width: '100%' }} />
          <Select.Content>
            <Select.Item value="none">No Environment</Select.Item>
            {environments.map(env => (
              <Select.Item key={env.id} value={env.id}>
                {env.name}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
      </div>

      {/* Iterations */}
      <div>
        <label style={{ fontSize: '12px', fontWeight: 500, display: 'block', marginBottom: '6px', color: 'var(--gray-12)' }}>
          Iterations
        </label>
        <TextField.Root
          type="number"
          min="1"
          value={config.iterations.toString()}
          onChange={(e) => onChange({
            ...config,
            iterations: Math.max(1, parseInt(e.target.value) || 1)
          })}
          size="2"
        />
        <p style={{ fontSize: '11px', color: 'var(--gray-9)', marginTop: '4px' }}>
          Number of times to run the collection
        </p>
      </div>

      {/* Data File */}
      <div>
        <label style={{ fontSize: '12px', fontWeight: 500, display: 'block', marginBottom: '6px', color: 'var(--gray-12)' }}>
          Data File
        </label>
        <input
          type="file"
          accept=".csv,.json"
          onChange={(e) => onChange({
            ...config,
            dataFile: e.target.files?.[0] || null
          })}
          style={{
            fontSize: '13px',
            padding: '6px',
            width: '100%',
            borderRadius: '6px',
            border: '1px solid var(--gray-6)',
            backgroundColor: 'var(--gray-2)'
          }}
        />
        <p style={{ fontSize: '11px', color: 'var(--gray-9)', marginTop: '4px' }}>
          CSV or JSON file for data-driven testing
        </p>
      </div>

      {/* Delay */}
      <div>
        <label style={{ fontSize: '12px', fontWeight: 500, display: 'block', marginBottom: '6px', color: isParallel ? 'var(--gray-9)' : 'var(--gray-12)' }}>
          Delay (ms)
        </label>
        <TextField.Root
          type="number"
          min="0"
          value={config.delay.toString()}
          onChange={(e) => onChange({
            ...config,
            delay: Math.max(0, parseInt(e.target.value) || 0)
          })}
          size="2"
          placeholder="0"
          disabled={isParallel}
        />
        <p style={{ fontSize: '11px', color: 'var(--gray-9)', marginTop: '4px' }}>
          {isParallel
            ? 'Delay has no effect on parallel runs (concurrency > 1)'
            : 'Delay between requests in milliseconds'}
        </p>
      </div>

      {/* Parallel Execution - only show if collection allows */}
      {config.allowParallel && (
        <>
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <Checkbox
                checked={config.parallel}
                onCheckedChange={(checked: boolean) => onChange({
                  ...config,
                  parallel: checked
                })}
              />
              <span style={{ fontSize: '13px', fontWeight: 500 }}>Parallel Execution</span>
            </label>
            <p style={{ fontSize: '11px', color: 'var(--gray-9)', marginTop: '4px' }}>
              Run requests in parallel
            </p>
          </div>

          {config.parallel && (
            <div>
              <label style={{ fontSize: '12px', fontWeight: 500, display: 'block', marginBottom: '6px', color: 'var(--gray-12)' }}>
                Concurrency
              </label>
              <TextField.Root
                type="number"
                min="1"
                max={config.maxConcurrency}
                value={config.concurrency.toString()}
                onChange={(e) => {
                  const value = parseInt(e.target.value) || 1;
                  onChange({
                    ...config,
                    concurrency: config.maxConcurrency ? Math.min(Math.max(1, value), config.maxConcurrency) : Math.max(1, value)
                  });
                }}
                size="2"
                placeholder="1"
              />
              <p style={{ fontSize: '11px', color: 'var(--gray-9)', marginTop: '4px' }}>
                {config.maxConcurrency
                  ? `Number of parallel requests (max: ${config.maxConcurrency})`
                  : 'Number of parallel requests'}
              </p>
            </div>
          )}
        </>
      )}

      {/* Options */}
      {/* <div style={{ borderTop: '1px solid var(--gray-6)', paddingTop: '12px' }}>
        <label style={{ fontSize: '12px', fontWeight: 500, display: 'block', marginBottom: '8px', color: 'var(--gray-12)' }}>
          Options
        </label>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <Checkbox
              checked={config.persistVariables}
              onCheckedChange={(checked: boolean) => onChange({
                ...config,
                persistVariables: checked
              })}
            />
            <span style={{ fontSize: '13px' }}>Persist variable changes</span>
          </label>
          
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <Checkbox
              checked={config.saveResponses}
              onCheckedChange={(checked: boolean) => onChange({
                ...config,
                saveResponses: checked
              })}
            />
            <span style={{ fontSize: '13px' }}>Save response bodies</span>
          </label>
        </div>
      </div> */}
    </div>
  );
}
