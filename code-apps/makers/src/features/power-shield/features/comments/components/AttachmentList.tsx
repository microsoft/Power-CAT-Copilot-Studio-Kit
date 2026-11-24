import { makeStyles, tokens } from '@fluentui/react-components';
import type { CommentAttachment } from '../../../models/comment';
import { AttachmentChip } from './AttachmentChip';

const useStyles = makeStyles({
  list: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalS,
    marginTop: tokens.spacingVerticalXS,
  },
});

interface AttachmentListProps {
  attachments: CommentAttachment[];
  onDownload: (annotationId: string) => void;
}

export function AttachmentList({ attachments, onDownload }: AttachmentListProps) {
  const styles = useStyles();

  if (attachments.length === 0) return null;

  return (
    <div className={styles.list}>
      {attachments.map((att) => (
        <AttachmentChip
          key={att.id}
          fileName={att.fileName}
          fileSize={att.fileSize}
          mimeType={att.mimeType}
          annotationId={att.id}
          onDownload={() => onDownload(att.id)}
        />
      ))}
    </div>
  );
}
