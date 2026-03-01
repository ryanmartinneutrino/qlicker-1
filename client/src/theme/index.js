import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    primary: { main: '#2196F3' },
    secondary: { main: '#FF9800' },
    success: { main: '#4CAF50' },
    error: { main: '#F44336' },
    background: { default: '#FAFAFA', paper: '#FFFFFF' },
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: { textTransform: 'none' },
      },
    },
  },
});

export default theme;
