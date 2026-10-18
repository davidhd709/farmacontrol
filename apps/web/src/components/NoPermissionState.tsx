import { Button, Stack, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import { NO_PERMISSION_MESSAGE } from '../api/http-client';

export function NoPermissionState() {
  return (
    <Stack spacing={2} role="status">
      <Typography component="h1" variant="h5">
        Sin permiso
      </Typography>
      <Typography>{NO_PERMISSION_MESSAGE}</Typography>
      <Button component={Link} to="/">
        Ir al panel principal
      </Button>
    </Stack>
  );
}
