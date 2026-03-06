import { useEffect, useState } from 'react';
import {
  Alert, Snackbar, useMediaQuery, useTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';

const DEFAULT_SAVE_ERROR = 'Changes could not be saved. Your last change was not recorded.';
const DEFAULT_SAVE_SUCCESS = 'Changes saved';

export default function AutoSaveStatus({ status = 'idle', errorText = '' }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [notice, setNotice] = useState({
    key: 0,
    open: false,
    severity: 'success',
    message: DEFAULT_SAVE_SUCCESS,
    autoHideDuration: 1200,
  });

  useEffect(() => {
    if (status === 'success') {
      setNotice((prev) => ({
        key: prev.key + 1,
        open: true,
        severity: 'success',
        message: DEFAULT_SAVE_SUCCESS,
        autoHideDuration: 1200,
      }));
      return;
    }

    if (status === 'error') {
      setNotice((prev) => ({
        key: prev.key + 1,
        open: true,
        severity: 'error',
        message: errorText || DEFAULT_SAVE_ERROR,
        autoHideDuration: null,
      }));
    }
  }, [status, errorText]);

  const closeNotice = () => {
    setNotice((prev) => ({ ...prev, open: false }));
  };

  if (!notice.open) {
    return null;
  }

  return (
    <Snackbar
      key={notice.key}
      open={notice.open}
      autoHideDuration={notice.autoHideDuration ?? undefined}
      onClose={closeNotice}
      anchorOrigin={{ vertical: 'bottom', horizontal: isMobile ? 'center' : 'right' }}
    >
      <Alert
        severity={notice.severity}
        variant="outlined"
        onClose={closeNotice}
        sx={(activeTheme) => ({
          width: '100%',
          color: notice.severity === 'success' ? activeTheme.palette.success.dark : activeTheme.palette.error.dark,
          borderColor: notice.severity === 'success'
            ? alpha(activeTheme.palette.success.main, 0.35)
            : alpha(activeTheme.palette.error.main, 0.35),
          backgroundColor: notice.severity === 'success'
            ? alpha(activeTheme.palette.success.main, 0.12)
            : alpha(activeTheme.palette.error.main, 0.12),
          '& .MuiAlert-icon': {
            color: 'inherit',
          },
        })}
      >
        {notice.message}
      </Alert>
    </Snackbar>
  );
}
