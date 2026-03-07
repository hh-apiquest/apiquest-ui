import React from 'react';
import type { UITabProps } from '@apiquest/plugin-ui-types';
import type { SoapRequestData, SoapAttachment } from '@apiquest/plugin-soap';
import * as RT from '@radix-ui/themes';

/**
 * AttachmentsTab — MTOM/MIME attachment management.
 *
 * Each attachment has: contentId, contentType, filename, contentBase64.
 * Users upload a file which is base64-encoded and stored in contentBase64.
 *
 * Persists to request.data.attachments.
 */
export function AttachmentsTab({ request, onChange }: UITabProps) {
  const data = request.data as unknown as SoapRequestData;
  const attachments: SoapAttachment[] = data.attachments ?? [];

  function updateAttachments(updated: SoapAttachment[]) {
    onChange({ ...request, data: { ...data, attachments: updated } });
  }

  function handleAdd() {
    const newAttachment: SoapAttachment = {
      contentId: `attachment-${Date.now()}`,
      contentType: 'application/octet-stream',
      filename: '',
      contentBase64: '',
    };
    updateAttachments([...attachments, newAttachment]);
  }

  function handleRemove(index: number) {
    updateAttachments(attachments.filter((_, i) => i !== index));
  }

  function handleFieldChange(index: number, field: keyof SoapAttachment, value: string) {
    updateAttachments(
      attachments.map((att, i) => i === index ? { ...att, [field]: value } : att)
    );
  }

  function handleFileUpload(index: number, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const result = evt.target?.result as string;
      // Strip the data URL prefix: "data:...;base64," 
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      updateAttachments(
        attachments.map((att, i) =>
          i === index
            ? {
                ...att,
                filename: file.name,
                contentType: file.type || 'application/octet-stream',
                contentBase64: base64 ?? '',
              }
            : att
        )
      );
    };
    reader.readAsDataURL(file);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16 }}>
      <RT.Flex justify="between" align="center">
        <RT.Text size="2" weight="bold">MTOM Attachments</RT.Text>
        <RT.Button size="2" variant="soft" onClick={handleAdd}>
          Add Attachment
        </RT.Button>
      </RT.Flex>

      {attachments.length === 0 && (
        <RT.Flex align="center" justify="center" py="8">
          <RT.Text size="2" color="gray">
            No attachments. Click Add Attachment to add MTOM/MIME content.
          </RT.Text>
        </RT.Flex>
      )}

      {attachments.map((att, index) => (
        <RT.Card key={index} style={{ padding: 12 }}>
          <RT.Flex direction="column" gap="2">
            <RT.Flex justify="between" align="center">
              <RT.Text size="1" weight="bold" color="gray">Attachment {index + 1}</RT.Text>
              <RT.Button
                size="1"
                variant="ghost"
                color="red"
                onClick={() => handleRemove(index)}
              >
                Remove
              </RT.Button>
            </RT.Flex>

            <RT.Grid columns="2" gap="2">
              <RT.Flex direction="column" gap="1">
                <RT.Text size="1" weight="bold" color="gray">Content ID</RT.Text>
                <RT.TextField.Root
                  value={att.contentId}
                  onChange={(e) => handleFieldChange(index, 'contentId', (e.target as HTMLInputElement).value)}
                  placeholder="attachment-1"
                  size="1"
                />
              </RT.Flex>

              <RT.Flex direction="column" gap="1">
                <RT.Text size="1" weight="bold" color="gray">Content Type</RT.Text>
                <RT.TextField.Root
                  value={att.contentType}
                  onChange={(e) => handleFieldChange(index, 'contentType', (e.target as HTMLInputElement).value)}
                  placeholder="application/pdf"
                  size="1"
                />
              </RT.Flex>
            </RT.Grid>

            <RT.Flex direction="column" gap="1">
              <RT.Text size="1" weight="bold" color="gray">File</RT.Text>
              <RT.Flex gap="2" align="center">
                <RT.Text size="1" color="gray" style={{ flex: 1 }}>
                  {att.filename || 'No file selected'}
                </RT.Text>
                <label style={{ cursor: 'pointer' }}>
                  <RT.Button size="1" variant="soft" asChild>
                    <span>Browse...</span>
                  </RT.Button>
                  <input
                    type="file"
                    style={{ display: 'none' }}
                    onChange={(e) => handleFileUpload(index, e)}
                  />
                </label>
              </RT.Flex>
            </RT.Flex>

            {att.contentBase64 && (
              <RT.Flex align="center" gap="2">
                <RT.Badge color="green" variant="soft" size="1">Encoded</RT.Badge>
                <RT.Text size="1" color="gray">
                  {Math.round(att.contentBase64.length * 0.75 / 1024)} KB
                </RT.Text>
              </RT.Flex>
            )}
          </RT.Flex>
        </RT.Card>
      ))}
    </div>
  );
}
