import { createTheme } from '@mui/material/styles';

export const appTheme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#0F766E',
      dark: '#0B5F59',
      light: '#CCFBF1',
      contrastText: '#FFFFFF',
    },
    background: {
      default: '#F5F8F7',
      paper: '#FFFFFF',
    },
    text: {
      primary: '#17211F',
      secondary: '#52605D',
    },
    divider: '#D7E0DD',
    success: {
      main: '#16734A',
    },
    warning: {
      main: '#9A5B00',
    },
    error: {
      main: '#B42318',
    },
    info: {
      main: '#175CD3',
    },
  },
  shape: {
    borderRadius: 8,
  },
  typography: {
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    h1: {
      fontSize: '1.75rem',
      fontWeight: 700,
      lineHeight: 1.2,
    },
    h2: {
      fontSize: '1.25rem',
      fontWeight: 700,
      lineHeight: 1.3,
    },
    button: {
      fontWeight: 700,
      textTransform: 'none',
    },
  },
  components: {
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        root: {
          minHeight: 44,
          borderRadius: 8,
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        fullWidth: true,
        variant: 'outlined',
      },
    },
    MuiPaper: {
      styleOverrides: {
        rounded: {
          borderRadius: 12,
        },
      },
    },
  },
});
