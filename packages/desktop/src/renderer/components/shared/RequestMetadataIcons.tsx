// Request Metadata Icons - Shows visual indicators for dependsOn and condition
import { Square3Stack3DIcon, BoltIcon } from '@heroicons/react/24/outline';
import * as Tooltip from '@radix-ui/react-tooltip';
import type { CollectionItem } from '@apiquest/types';

interface RequestMetadataIconsProps {
  resource: CollectionItem;
}

export function RequestMetadataIcons({ resource }: RequestMetadataIconsProps) {
  const hasDependsOn = resource.dependsOn && resource.dependsOn.length > 0;
  const hasCondition = !!resource.condition;
  
  if (!hasDependsOn && !hasCondition) return null;
  
  const iconColor = 'var(--orange-9)';
  
  return (
    <span className="flex items-center gap-0.5" style={{ color: iconColor }}>
      {hasDependsOn && (
        <Tooltip.Provider delayDuration={300}>
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <span className="inline-flex">
                <Square3Stack3DIcon className="w-4 h-4" />
              </span>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content
                className="select-none rounded px-2 py-1 text-xs leading-none shadow-md"
                style={{
                  backgroundColor: 'var(--gray-12)',
                  color: 'var(--gray-1)',
                  maxWidth: '300px'
                }}
                sideOffset={5}
              >
                <div className="font-semibold mb-1">Dependencies</div>
                <div className="text-xs opacity-90">
                  Depends on: {resource.dependsOn!.join(', ')}
                </div>
                <Tooltip.Arrow style={{ fill: 'var(--gray-12)' }} />
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        </Tooltip.Provider>
      )}
      {hasCondition && (
        <Tooltip.Provider delayDuration={300}>
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <span className="inline-flex">
                <BoltIcon className="w-4 h-4" />
              </span>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content
                className="select-none rounded px-2 py-1 text-xs leading-none shadow-md"
                style={{
                  backgroundColor: 'var(--gray-12)',
                  color: 'var(--gray-1)',
                  maxWidth: '300px'
                }}
                sideOffset={5}
              >
                <div className="font-semibold mb-1">Conditional Execution</div>
                <div className="text-xs opacity-90 font-mono break-all">
                  {resource.condition}
                </div>
                <Tooltip.Arrow style={{ fill: 'var(--gray-12)' }} />
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        </Tooltip.Provider>
      )}
    </span>
  );
}
