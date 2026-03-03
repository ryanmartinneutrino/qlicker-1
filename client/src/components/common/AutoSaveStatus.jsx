import { Typography } from '@mui/material';

const DEFAULT_SAVE_ERROR = 'Changes could not be saved. Your last change was not recorded.';

export default function AutoSaveStatus({ status = 'idle', errorText = '' }) {
  let text = 'Changes save automatically.';
  let color = 'text.secondary';

  if (status === 'saving') {
    text = 'Saving changes...';
  } else if (status === 'success') {
    text = 'Changes saved automatically.';
    color = 'success.main';
  } else if (status === 'error') {
    text = errorText || DEFAULT_SAVE_ERROR;
    color = 'error.main';
  }

  return (
    <Typography variant="caption" sx={{ color, display: 'block' }}>
      {text}
    </Typography>
  );
}
