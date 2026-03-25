// UnifiedContextMenu - Single menu system for both three-dots and right-click
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ReactNode, type JSX } from 'react';
import type { ContextMenuPosition, EnvironmentContextInfo } from '../../types/context-menu';

export type MenuAction = 
  | 'edit-variables' | 'set-active' | 'rename' | 'duplicate' | 'delete'
  | 'add-request' | 'add-folder' | 'collection-variables' | 'export' | 'run';

interface MenuItem {
  label: string;
  action: MenuAction;
  danger?: boolean;
}

interface MenuSection {
  items: MenuItem[];
}

interface UnifiedContextMenuProps {
  type: 'environment' | 'collection' | 'folder' | 'request';
  item: unknown;
  trigger?: ReactNode;  // For three-dots button
  open?: boolean;       // For right-click control
  onOpenChange?: (open: boolean) => void;
  onAction: (action: MenuAction, item: unknown) => void;
  position?: ContextMenuPosition;  // For right-click positioning
  additionalInfo?: EnvironmentContextInfo; // For dynamic menu items (e.g., active status)
}

function getPortalContainer(): HTMLElement {
  return document.querySelector<HTMLElement>('.radix-themes') ?? document.body;
}

export function UnifiedContextMenu({
  type,
  item,
  trigger,
  open,
  onOpenChange,
  onAction,
  position,
  additionalInfo
}: UnifiedContextMenuProps): JSX.Element {
  const getMenuSections = (): MenuSection[] => {
    switch (type) {
      case 'environment':
        return [
          {
            items: [
              { label: 'Edit Variables', action: 'edit-variables' }
            ]
          },
          {
            items: [
              { 
                label: additionalInfo?.isActive === true ? 'Deactivate' : 'Set Active', 
                action: 'set-active' 
              }
            ]
          },
          {
            items: [
              { label: 'Rename', action: 'rename' },
              { label: 'Duplicate', action: 'duplicate' }
            ]
          },
          {
            items: [
              { label: 'Delete', action: 'delete', danger: true }
            ]
          }
        ];
      
      case 'collection':
        return [
          {
            items: [
              { label: 'Run Collection', action: 'run' }
            ]
          },
          {
            items: [
              { label: 'Collection Variables', action: 'collection-variables' }
            ]
          },
          {
            items: [
              { label: 'Rename', action: 'rename' },
              { label: 'Duplicate', action: 'duplicate' },
              { label: 'Export', action: 'export' }
            ]
          },
          {
            items: [
              { label: 'Delete', action: 'delete', danger: true }
            ]
          }
        ];
      
      case 'folder':
        return [
          {
            items: [
              { label: 'Rename', action: 'rename' }
            ]
          },
          {
            items: [
              { label: 'Delete', action: 'delete', danger: true }
            ]
          }
        ];
      
      case 'request':
        return [
          {
            items: [
              { label: 'Rename', action: 'rename' },
              { label: 'Duplicate', action: 'duplicate' }
            ]
          },
          {
            items: [
              { label: 'Delete', action: 'delete', danger: true }
            ]
          }
        ];
    }
  };

  const menuSections = getMenuSections();

  // For right-click: render as fixed positioned dropdown
  if (position !== undefined) {
    return (
      <DropdownMenu.Root open={open} onOpenChange={onOpenChange}>
        <DropdownMenu.Portal container={getPortalContainer()}>
          <DropdownMenu.Content
            className="context-menu"
            style={{
              position: 'fixed',
              left: `${position.x}px`,
              top: `${position.y}px`
            }}
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            {menuSections.map((section, sectionIndex) => (
              <div key={sectionIndex}>
                {section.items.map((menuItem) => (
                  <DropdownMenu.Item
                    key={menuItem.action}
                    className={`context-menu-item ${menuItem.danger === true ? 'context-menu-item-danger' : ''}`}
                    onSelect={() => onAction(menuItem.action, item)}
                  >
                    {menuItem.label}
                  </DropdownMenu.Item>
                ))}
                {sectionIndex < menuSections.length - 1 && (
                  <DropdownMenu.Separator className="context-menu-separator" />
                )}
              </div>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    );
  }

  // For three-dots: render with trigger
  return (
    <DropdownMenu.Root open={open} onOpenChange={onOpenChange}>
      <DropdownMenu.Trigger asChild>
        {trigger}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal container={getPortalContainer()}>
        <DropdownMenu.Content
          className="context-menu"
          align="start"
          sideOffset={5}
        >
          {menuSections.map((section, sectionIndex) => (
            <div key={sectionIndex}>
              {section.items.map((menuItem) => (
                <DropdownMenu.Item
                  key={menuItem.action}
                  className={`context-menu-item ${menuItem.danger === true ? 'context-menu-item-danger' : ''}`}
                  onSelect={() => onAction(menuItem.action, item)}
                >
                  {menuItem.label}
                </DropdownMenu.Item>
              ))}
              {sectionIndex < menuSections.length - 1 && (
                <DropdownMenu.Separator className="context-menu-separator" />
              )}
            </div>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
