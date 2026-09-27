import { Link } from 'react-router-dom';
import { Button } from '@mui/material';

export function HomeBackButton({ sx }: { sx?: object }) {
  return (
    <Button
      component={Link}
      to="/"
      color="inherit"
      data-testid="home-back-btn"
      sx={{
        fontWeight: 700,
        textTransform: 'none',
        fontSize: '0.95rem',
        color: 'text.primary',
        ...sx,
      }}
    >
      ← Inicio
    </Button>
  );
}
