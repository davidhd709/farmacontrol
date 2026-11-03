import { createTheme } from '@mui/material/styles';
import { esES } from '@mui/material/locale';

/**
 * Tema de la aplicación. El locale es-ES de Material UI se aplica de forma global (paginación
 * "Filas por página", "1–1 de 1" y etiquetas accesibles en español), no tabla por tabla.
 */
export const appTheme = createTheme(
  {
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
      // Revisión responsive (2026-11-02): el texto de un botón nunca se corta ni se desborda y el
      // botón no se encoge por el contenido vecino; el relleno es el mismo en toda la app
      MuiButton: {
        defaultProps: {
          disableElevation: true,
        },
        styleOverrides: {
          root: {
            minHeight: 44,
            borderRadius: 8,
            whiteSpace: 'nowrap',
            flexShrink: 0,
            paddingInline: 16,
          },
          sizeSmall: {
            minHeight: 36,
            paddingInline: 12,
          },
        },
      },
      // Títulos de página: todo h1 tiene el mismo tamaño en todas las pantallas (más chico en móvil)
      MuiTypography: {
        styleOverrides: {
          root: {
            '&:is(h1)': {
              fontSize: '1.75rem',
              fontWeight: 700,
              lineHeight: 1.2,
              '@media (max-width: 599.95px)': { fontSize: '1.375rem' },
            },
          },
        },
      },
      // Las tablas desplazan horizontalmente dentro de su contenedor, nunca la página
      MuiTableContainer: {
        styleOverrides: {
          root: { overflowX: 'auto', maxWidth: '100%' },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          head: { whiteSpace: 'nowrap', fontWeight: 700 },
        },
      },
      // El layout ya da el margen lateral: los Container de cada página no lo duplican
      MuiContainer: {
        defaultProps: {
          disableGutters: true,
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
  },
  esES,
);
