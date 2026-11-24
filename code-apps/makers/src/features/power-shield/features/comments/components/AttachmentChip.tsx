import { useState } from 'react';
import { Button, Text, makeStyles, tokens } from '@fluentui/react-components';
import { Attach16Regular, ArrowDownload16Regular, Eye16Regular } from '@fluentui/react-icons';
import { formatFileSize } from '../../../shared/utils/fileUtils';
import { DocumentPreviewDialog } from '../../../shared/components/DocumentPreviewDialog';

const useStyles = makeStyles({
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusMedium,
    paddingTop: tokens.spacingVerticalXXS,
    paddingBottom: tokens.spacingVerticalXXS,
    paddingLeft: tokens.spacingHorizontalS,
    paddingRight: tokens.spacingHorizontalXXS,
  },
});

interface AttachmentChipProps {
  fileName: string;
  fileSize: number;
  mimeType?: string;
  annotationId?: string;
  onDownload: () => void;
}

export function AttachmentChip({
  fileName,
  fileSize,
  mimeType,
  annotationId,
  onDownload,
}: AttachmentChipProps) {
  const styles = useStyles();
  const [previewOpen, setPreviewOpen] = useState(false);

  const canPreview = !!(annotationId && mimeType);

  return (
    <>
      <span className={styles.chip}>
        <Attach16Regular />
        <Text size={200}>{fileName}</Text>
        <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
          ({formatFileSize(fileSize)})
        </Text>
        {canPreview && (
          <Button
            appearance="subtle"
            size="small"
            icon={<Eye16Regular />}
            onClick={() => setPreviewOpen(true)}
            aria-label={`Preview ${fileName}`}
          />
        )}
        <Button
          appearance="subtle"
          size="small"
          icon={<ArrowDownload16Regular />}
          onClick={onDownload}
          aria-label={`Download ${fileName}`}
        />
      </span>

      {canPreview && (
        <DocumentPreviewDialog
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          fileName={fileName}
          mimeType={mimeType!}
          annotationId={annotationId}
        />
      )}
    </>
  );
}
