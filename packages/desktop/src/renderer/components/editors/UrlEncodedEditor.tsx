// UrlEncodedEditor - Key-value editor for application/x-www-form-urlencoded body type
import { TextField, Checkbox, Table } from '@radix-ui/themes';

interface KeyValuePair {
  disabled?: boolean;
  key: string;
  value: string;
  description?: string;
}

export interface UrlEncodedEditorProps {
  data: KeyValuePair[];
  onChange: (data: KeyValuePair[]) => void;
}

export function UrlEncodedEditor({ data, onChange }: UrlEncodedEditorProps) {
  const handleChange = (index: number, field: 'key' | 'value' | 'disabled', value: string | boolean) => {
    const updated = [...data];
    if (field === 'disabled') {
      updated[index].disabled = value as boolean;
    } else {
      updated[index][field] = value as string;
    }
    onChange(updated);
  };

  const handleDelete = (index: number) => {
    const updated = data.filter((_, i) => i !== index);
    onChange(updated.length > 0 ? updated : [{ disabled: false, key: '', value: '' }]);
  };

  const handleAdd = () => {
    onChange([...data, { disabled: false, key: '', value: '' }]);
  };

  // Auto-add empty row when last row has content
  const lastRow = data[data.length - 1];
  const needsEmptyRow = lastRow && (lastRow.key.trim() !== '' || lastRow.value.trim() !== '');
  if (needsEmptyRow) {
    setTimeout(() => handleAdd(), 0);
  }

  return (
    <div className="h-full flex flex-col overflow-auto">
      <Table.Root size="1" variant="surface">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeaderCell style={{ width: '32px' }}></Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell style={{ width: '40%' }}>Key</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell style={{ width: '40%' }}>Value</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell style={{ width: '40px' }}></Table.ColumnHeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {data.map((pair, index) => {
            const isLastRow = index === data.length - 1;
            
            return (
              <Table.Row key={index}>
                <Table.Cell>
                  {!isLastRow && (
                    <Checkbox
                      checked={!pair.disabled}
                      onCheckedChange={(checked) => handleChange(index, 'disabled', checked !== true)}
                      size="1"
                    />
                  )}
                </Table.Cell>
                <Table.Cell>
                  <TextField.Root
                    value={pair.key}
                    onChange={(e) => handleChange(index, 'key', e.target.value)}
                    placeholder="Key"
                    size="1"
                  />
                </Table.Cell>
                <Table.Cell>
                  <TextField.Root
                    value={pair.value}
                    onChange={(e) => handleChange(index, 'value', e.target.value)}
                    placeholder="Value"
                    size="1"
                  />
                </Table.Cell>
                <Table.Cell>
                  {!isLastRow && (
                    <button
                      onClick={() => handleDelete(index)}
                      className="text-xs cursor-pointer border-none bg-transparent"
                      style={{ color: 'var(--gray-9)', padding: '2px 4px' }}
                      title="Delete"
                    >
                      ×
                    </button>
                  )}
                </Table.Cell>
              </Table.Row>
            );
          })}
        </Table.Body>
      </Table.Root>
    </div>
  );
}
