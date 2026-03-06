import { createTheme } from '@mui/material/styles';

const COMPACT_SMALL_INPUT_PADDING = '8.5px';

const theme = createTheme({
  palette: {
    primary: { main: '#2196F3' },
    secondary: { main: '#FF9800' },
    success: { main: '#4CAF50' },
    error: { main: '#F44336' },
    background: { default: '#FAFAFA', paper: '#FFFFFF' },
  },
  typography: {
    fontFamily: '"Helvetica Neue", "Helvetica", "Arial", sans-serif',
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: { textTransform: 'none' },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        inputSizeSmall: {
          paddingTop: COMPACT_SMALL_INPUT_PADDING,
          paddingBottom: COMPACT_SMALL_INPUT_PADDING,
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        select: {
          '&.MuiInputBase-inputSizeSmall': {
            paddingTop: COMPACT_SMALL_INPUT_PADDING,
            paddingBottom: COMPACT_SMALL_INPUT_PADDING,
          },
        },
      },
    },
  },
});

export default theme;
