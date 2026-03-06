import { Chip } from '@mui/material';

const STATUS_META = {
  hidden: { label: 'Draft', color: 'default' },
  visible: { label: 'Upcoming', color: 'info' },
  running: { label: 'Live', color: 'success' },
  done: { label: 'Ended', color: 'warning' },
};

export default function SessionStatusChip({
  status = 'hidden',
  size = 'small',
  sx,
  ...chipProps
}) {
  const statusMeta = STATUS_META[status] || { label: status || 'Unknown', color: 'default' };
  const isHidden = status === 'hidden';

  return (
    <Chip
      label={statusMeta.label}
      color={statusMeta.color}
      variant="outlined"
      size={size}
      sx={{
        borderRadius: 1.4,
        fontWeight: isHidden ? 500 : 600,
        borderColor: isHidden ? 'action.disabledBackground' : undefined,
        color: isHidden ? 'text.disabled' : undefined,
        '& .MuiChip-label': {
          px: size === 'small' ? 1.15 : 1.4,
          color: isHidden ? 'text.disabled' : undefined,
          fontWeight: isHidden ? 500 : 600,
        },
        ...sx,
      }}
      {...chipProps}
    />
  );
}
