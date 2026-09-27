import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  InputAdornment,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Controller, useForm } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '../../../api/http-client';
import { useAuth } from '../hooks/useAuth';
import { loginSchema, type LoginFormValues } from '../validation/login.schema';

interface LoginLocationState {
  from?: {
    pathname?: string;
  };
}

function getLoginErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return 'El usuario o la contraseña son incorrectos.';
    }

    if (error.status === 0) {
      return error.message;
    }

    if (error.status >= 500) {
      return 'El servicio de autenticación no está disponible. Intenta nuevamente en unos minutos.';
    }

    return error.message;
  }

  return 'No fue posible iniciar sesión. Intenta nuevamente.';
}

export function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const { login, isLoggingIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as LoginLocationState | null;

  const {
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: '',
      password: '',
    },
    mode: 'onBlur',
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await login(values);
      navigate(locationState?.from?.pathname || '/', { replace: true });
    } catch (error) {
      setError('root', {
        type: 'server',
        message: getLoginErrorMessage(error),
      });
    }
  });

  return (
    <Box
      component="main"
      sx={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        px: 2,
        py: 4,
        bgcolor: 'background.default',
      }}
    >
      <Paper
        component="section"
        aria-labelledby="login-title"
        variant="outlined"
        sx={{
          width: '100%',
          maxWidth: 440,
          p: { xs: 3, sm: 4 },
          borderColor: 'divider',
          boxShadow: '0 12px 32px rgba(23, 33, 31, 0.08)',
        }}
      >
        <Stack spacing={3}>
          <Stack spacing={1.5} sx={{ alignItems: 'center', textAlign: 'center' }}>
            <Box
              aria-hidden="true"
              sx={{
                width: 48,
                height: 48,
                display: 'grid',
                placeItems: 'center',
                borderRadius: 2,
                bgcolor: 'primary.main',
                color: 'primary.contrastText',
                fontWeight: 800,
                letterSpacing: '-0.04em',
              }}
            >
              Rx
            </Box>
            <Box>
              <Typography
                component="p"
                variant="overline"
                color="primary.main"
                sx={{ fontWeight: 800 }}
              >
                FarmaControl
              </Typography>
              <Typography id="login-title" component="h1" variant="h1">
                Iniciar sesión
              </Typography>
              <Typography color="text.secondary" sx={{ mt: 1 }}>
                Ingresa tus credenciales para acceder a FarmaControl.
              </Typography>
            </Box>
          </Stack>

          {errors.root?.message ? (
            <Alert severity="error" role="alert">
              {errors.root.message}
            </Alert>
          ) : null}

          <Box component="form" onSubmit={(event) => void onSubmit(event)} noValidate>
            <Stack spacing={2.5}>
              <Controller
                name="username"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Usuario"
                    autoComplete="username"
                    autoFocus
                    disabled={isLoggingIn}
                    error={Boolean(errors.username)}
                    helperText={errors.username?.message || ' '}
                    slotProps={{ htmlInput: { maxLength: 50 } }}
                  />
                )}
              />

              <Controller
                name="password"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    type={showPassword ? 'text' : 'password'}
                    label="Contraseña"
                    autoComplete="current-password"
                    disabled={isLoggingIn}
                    error={Boolean(errors.password)}
                    helperText={errors.password?.message || ' '}
                    slotProps={{
                      htmlInput: { maxLength: 128 },
                      input: {
                        endAdornment: (
                          <InputAdornment position="end">
                            <Button
                              type="button"
                              size="small"
                              color="inherit"
                              onClick={() => setShowPassword((visible) => !visible)}
                              aria-label={
                                showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'
                              }
                              sx={{ minWidth: 'auto', minHeight: 36, px: 1 }}
                            >
                              {showPassword ? 'Ocultar' : 'Mostrar'}
                            </Button>
                          </InputAdornment>
                        ),
                      },
                    }}
                  />
                )}
              />

              <Button
                type="submit"
                variant="contained"
                size="large"
                disabled={isLoggingIn}
                startIcon={isLoggingIn ? <CircularProgress size={18} color="inherit" /> : undefined}
              >
                {isLoggingIn ? 'Ingresando…' : 'Ingresar'}
              </Button>
            </Stack>
          </Box>
        </Stack>
      </Paper>
    </Box>
  );
}
