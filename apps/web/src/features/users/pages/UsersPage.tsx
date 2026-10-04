import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HomeBackButton } from '../../../components/HomeBackButton';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { SweetModal } from '../../../components/SweetModal';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  FormGroup,
  InputAdornment,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import type { SystemUserListItemDto } from '@farmacia/contracts';
import {
  createSystemUser,
  fetchRoles,
  fetchUsers,
  updateSystemUserRoles,
  updateSystemUserStatus,
} from '../api/users.api';

export function UsersPage() {
  const queryClient = useQueryClient();

  const [searchTerm, setSearchTerm] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<SystemUserListItemDto | null>(null);

  // Confirmaciones modales
  const [userToToggleStatus, setUserToToggleStatus] = useState<SystemUserListItemDto | null>(null);
  const [isConfirmCreateOpen, setIsConfirmCreateOpen] = useState(false);
  const [isConfirmEditRolesOpen, setIsConfirmEditRolesOpen] = useState(false);

  // Formulario creación
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [selectedRoles, setSelectedRoles] = useState<string[]>(['cajero']);
  const [createError, setCreateError] = useState<string | null>(null);

  // Formulario edición de roles
  const [editRoles, setEditRoles] = useState<string[]>([]);
  const [editError, setEditError] = useState<string | null>(null);

  // Notificaciones flotantes (Toast / Snackbar)
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error' | 'info' | 'warning';
  }>({
    open: false,
    message: '',
    severity: 'success',
  });

  const notify = (
    message: string,
    severity: 'success' | 'error' | 'info' | 'warning' = 'success'
  ) => {
    setSnackbar({ open: true, message, severity });
  };

  // Consultas
  const usersQuery = useQuery({
    queryKey: ['users', 'list'],
    queryFn: fetchUsers,
  });

  const rolesQuery = useQuery({
    queryKey: ['users', 'roles'],
    queryFn: fetchRoles,
  });

  // Mutación crear usuario
  const createMutation = useMutation({
    mutationFn: createSystemUser,
    onSuccess: (newUser) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setIsConfirmCreateOpen(false);
      setIsCreateOpen(false);
      setNewUsername('');
      setNewPassword('');
      setSelectedRoles(['cajero']);
      setCreateError(null);
      notify(`Usuario "${newUser.username}" creado exitosamente.`);
    },
    onError: (err: any) => {
      setIsConfirmCreateOpen(false);
      const msg = err.message || 'Error al crear el usuario.';
      setCreateError(msg);
      notify(msg, 'error');
    },
  });

  // Mutación activar / desactivar
  const statusMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      updateSystemUserStatus(id, isActive),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setUserToToggleStatus(null);
      notify(
        `Usuario "${updated.username}" ${updated.isActive ? 'activado' : 'desactivado'} con éxito.`
      );
    },
    onError: (err: any) => {
      setUserToToggleStatus(null);
      notify(err.message || 'Error al cambiar estado del usuario.', 'error');
    },
  });

  // Mutación roles
  const rolesMutation = useMutation({
    mutationFn: ({ id, roles }: { id: string; roles: string[] }) =>
      updateSystemUserRoles(id, roles),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setIsConfirmEditRolesOpen(false);
      setEditingUser(null);
      setEditError(null);
      notify(`Roles actualizados para "${updated.username}".`);
    },
    onError: (err: any) => {
      setIsConfirmEditRolesOpen(false);
      const msg = err.message || 'Error al actualizar roles.';
      setEditError(msg);
      notify(msg, 'error');
    },
  });

  const handleOpenEditRoles = (user: SystemUserListItemDto) => {
    setEditingUser(user);
    setEditRoles([...user.roles]);
    setEditError(null);
  };

  const handleToggleRoleForCreate = (roleName: string) => {
    setSelectedRoles((prev) =>
      prev.includes(roleName) ? prev.filter((r) => r !== roleName) : [...prev, roleName]
    );
  };

  const handleToggleRoleForEdit = (roleName: string) => {
    setEditRoles((prev) =>
      prev.includes(roleName) ? prev.filter((r) => r !== roleName) : [...prev, roleName]
    );
  };

  const handlePreSubmitCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim()) {
      setCreateError('Ingresa un nombre de usuario.');
      return;
    }
    if (!newPassword || newPassword.length < 8) {
      setCreateError('La contraseña debe contener al menos 8 caracteres.');
      return;
    }
    setCreateError(null);
    setIsConfirmCreateOpen(true);
  };

  const handleConfirmCreate = () => {
    createMutation.mutate({
      username: newUsername.trim(),
      password: newPassword,
      roles: selectedRoles,
    });
  };

  const handlePreSubmitEditRoles = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setIsConfirmEditRolesOpen(true);
  };

  const handleConfirmEditRoles = () => {
    if (!editingUser) return;
    rolesMutation.mutate({
      id: editingUser.id,
      roles: editRoles,
    });
  };

  const filteredUsers = (usersQuery.data ?? []).filter((u) => {
    const q = searchTerm.toLowerCase();
    return (
      u.username.toLowerCase().includes(q) ||
      u.roles.some((r) => r.toLowerCase().includes(q))
    );
  });

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Stack spacing={3}>
        {/* Cabecera Principal */}
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            justifyContent: 'space-between',
            alignItems: { xs: 'flex-start', sm: 'center' },
            gap: 2,
          }}
        >
          <Box>
            <Typography variant="h4" component="h1" sx={{ fontWeight: 800, color: 'text.primary' }}>
              Gestión de Usuarios y Roles
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Administración de cuentas de acceso, asignación de perfiles y permisos operativos del sistema.
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', width: { xs: '100%', sm: 'auto' } }}>
            <HomeBackButton />
            <Button
              variant="contained"
              color="primary"
              onClick={() => setIsCreateOpen(true)}
              sx={{ flexShrink: 0, fontWeight: 700 }}
            >
              + Nuevo Usuario
            </Button>
          </Box>
        </Box>

        {/* Tarjeta de Resumen y Búsqueda */}
        <Paper
          elevation={0}
          sx={{
            p: 2.5,
            border: 1,
            borderColor: 'divider',
            borderRadius: 2,
            bgcolor: 'background.paper',
          }}
        >
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <TextField
              size="small"
              placeholder="Buscar por usuario o rol…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              sx={{ maxWidth: { xs: '100%', sm: 380 }, width: '100%' }}
              slotProps={{
                input: {
                  startAdornment: <InputAdornment position="start">🔍</InputAdornment>,
                },
              }}
            />
            <Typography variant="body2" color="text.secondary">
              Total de cuentas registradas: <strong>{usersQuery.data?.length ?? 0}</strong>
            </Typography>
          </Stack>
        </Paper>

        {/* Tabla de Usuarios */}
        <TableContainer
          component={Paper}
          elevation={0}
          sx={{
            border: 1,
            borderColor: 'divider',
            borderRadius: 2,
            overflow: 'hidden',
          }}
        >
          {usersQuery.isLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
              <CircularProgress size={36} />
            </Box>
          ) : usersQuery.isError ? (
            <Box sx={{ p: 4 }}>
              <Alert severity="error">No fue posible cargar el listado de usuarios.</Alert>
            </Box>
          ) : filteredUsers.length === 0 ? (
            <Box sx={{ p: 6, textAlign: 'center' }}>
              <Typography variant="h6" color="text.secondary">
                No se encontraron usuarios
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {searchTerm ? 'Intenta con otro término de búsqueda.' : 'Crea el primer usuario con el botón superior.'}
              </Typography>
            </Box>
          ) : (
            <Table>
              <TableHead sx={{ bgcolor: 'grey.50' }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Usuario</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Roles Asignados</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Estado</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Fecha de Registro</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Acciones</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredUsers.map((u) => (
                  <TableRow key={u.id} hover>
                    <TableCell>
                      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                        <Avatar
                          sx={{
                            width: 36,
                            height: 36,
                            bgcolor: u.isActive ? 'primary.main' : 'grey.400',
                            fontSize: '0.95rem',
                            fontWeight: 700,
                          }}
                        >
                          {u.username.substring(0, 2).toUpperCase()}
                        </Avatar>
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>
                            {u.username}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            ID: {u.id.substring(0, 8)}…
                          </Typography>
                        </Box>
                      </Stack>
                    </TableCell>

                    <TableCell>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.8 }}>
                        {u.roles.length > 0 ? (
                          u.roles.map((r) => (
                            <Chip
                              key={r}
                              label={r}
                              size="small"
                              variant={r === 'admin' ? 'filled' : 'outlined'}
                              color={r === 'admin' ? 'primary' : 'default'}
                              sx={{ fontWeight: 600, textTransform: 'capitalize' }}
                            />
                          ))
                        ) : (
                          <Typography variant="caption" color="text.secondary">
                            Sin roles asignados
                          </Typography>
                        )}
                      </Box>
                    </TableCell>

                    <TableCell>
                      <Chip
                        label={u.isActive ? 'Activo' : 'Inactivo'}
                        color={u.isActive ? 'success' : 'default'}
                        size="small"
                        sx={{ fontWeight: 700 }}
                      />
                    </TableCell>

                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {new Date(u.createdAt).toLocaleDateString('es-CO', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </Typography>
                    </TableCell>

                    <TableCell align="right">
                      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => handleOpenEditRoles(u)}
                          sx={{ textTransform: 'none', fontWeight: 600 }}
                        >
                          Editar Roles
                        </Button>

                        <Button
                          size="small"
                          variant="outlined"
                          color={u.isActive ? 'error' : 'success'}
                          onClick={() => setUserToToggleStatus(u)}
                          disabled={statusMutation.isPending}
                          sx={{ textTransform: 'none', fontWeight: 600 }}
                        >
                          {u.isActive ? 'Desactivar' : 'Activar'}
                        </Button>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TableContainer>
      </Stack>

      {/* MODAL CREAR USUARIO */}
      <Dialog
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <form onSubmit={handlePreSubmitCreate}>
          <DialogTitle sx={{ fontWeight: 800 }}>Nuevo Usuario del Sistema</DialogTitle>
          <DialogContent dividers>
            <Stack spacing={2.5} sx={{ mt: 1 }}>
              {createError && <Alert severity="error">{createError}</Alert>}

              <TextField
                label="Nombre de Usuario (Login)"
                required
                fullWidth
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="ej: farmaceutico1"
                helperText="Mínimo 3 caracteres alfanuméricos"
              />

              <TextField
                label="Contraseña Temporal / Inicial"
                type="password"
                required
                fullWidth
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                helperText="Mínimo 8 caracteres de seguridad"
              />

              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                  Perfiles y Roles Asignados:
                </Typography>
                <Paper variant="outlined" sx={{ p: 2, maxHeight: 200, overflowY: 'auto' }}>
                  <FormGroup>
                    {(rolesQuery.data ?? []).map((r) => (
                      <FormControlLabel
                        key={r.id}
                        control={
                          <Checkbox
                            checked={selectedRoles.includes(r.name)}
                            onChange={() => handleToggleRoleForCreate(r.name)}
                          />
                        }
                        label={
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 700, textTransform: 'capitalize' }}>
                              {r.name}
                            </Typography>
                            {r.description && (
                              <Typography variant="caption" color="text.secondary">
                                {r.description}
                              </Typography>
                            )}
                          </Box>
                        }
                        sx={{ mb: 1, alignItems: 'flex-start' }}
                      />
                    ))}
                  </FormGroup>
                </Paper>
              </Box>
            </Stack>
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setIsCreateOpen(false)}>Cancelar</Button>
            <Button
              type="submit"
              variant="contained"
              color="primary"
              disabled={createMutation.isPending}
            >
              Continuar
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* MODAL EDITAR ROLES */}
      <Dialog
        open={Boolean(editingUser)}
        onClose={() => setEditingUser(null)}
        maxWidth="sm"
        fullWidth
      >
        <form onSubmit={handlePreSubmitEditRoles}>
          <DialogTitle sx={{ fontWeight: 800 }}>
            Editar Roles para {editingUser?.username}
          </DialogTitle>
          <DialogContent dividers>
            <Stack spacing={2} sx={{ mt: 1 }}>
              {editError && <Alert severity="error">{editError}</Alert>}

              <Typography variant="body2" color="text.secondary">
                Selecciona los roles de acceso que tendrá este colaborador en la plataforma:
              </Typography>

              <Paper variant="outlined" sx={{ p: 2, maxHeight: 260, overflowY: 'auto' }}>
                <FormGroup>
                  {(rolesQuery.data ?? []).map((r) => (
                    <FormControlLabel
                      key={r.id}
                      control={
                        <Checkbox
                          checked={editRoles.includes(r.name)}
                          onChange={() => handleToggleRoleForEdit(r.name)}
                        />
                      }
                      label={
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 700, textTransform: 'capitalize' }}>
                            {r.name}
                          </Typography>
                          {r.description && (
                            <Typography variant="caption" color="text.secondary">
                              {r.description}
                            </Typography>
                          )}
                        </Box>
                      }
                      sx={{ mb: 1, alignItems: 'flex-start' }}
                    />
                  ))}
                </FormGroup>
              </Paper>
            </Stack>
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setEditingUser(null)}>Cancelar</Button>
            <Button
              type="submit"
              variant="contained"
              color="primary"
              disabled={rolesMutation.isPending}
            >
              Guardar Cambios
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* DIÁLOGO CONFIRMACIÓN: ACTIVAR / DESACTIVAR */}
      <ConfirmDialog
        open={Boolean(userToToggleStatus)}
        onClose={() => setUserToToggleStatus(null)}
        onConfirm={() => {
          if (userToToggleStatus) {
            statusMutation.mutate({
              id: userToToggleStatus.id,
              isActive: !userToToggleStatus.isActive,
            });
          }
        }}
        isLoading={statusMutation.isPending}
        title={userToToggleStatus?.isActive ? 'Desactivar Usuario' : 'Activar Usuario'}
        description={
          userToToggleStatus?.isActive
            ? `¿Estás seguro de que deseas desactivar al usuario "${userToToggleStatus.username}"? El colaborador no podrá acceder al sistema ni realizar ventas u operaciones.`
            : `¿Estás seguro de reactivar al usuario "${userToToggleStatus?.username}"? Podrá volver a iniciar sesión con sus credenciales autorizadas.`
        }
        confirmText={userToToggleStatus?.isActive ? 'Sí, desactivar' : 'Sí, activar'}
        confirmColor={userToToggleStatus?.isActive ? 'error' : 'success'}
      />

      {/* DIÁLOGO CONFIRMACIÓN: CREAR USUARIO */}
      <ConfirmDialog
        open={isConfirmCreateOpen}
        onClose={() => setIsConfirmCreateOpen(false)}
        onConfirm={handleConfirmCreate}
        isLoading={createMutation.isPending}
        title="Confirmar Creación de Usuario"
        description={`¿Estás seguro de registrar al usuario "${newUsername}" con los roles: ${selectedRoles.join(', ')}?`}
        confirmText="Confirmar y Crear"
        confirmColor="primary"
      />

      {/* DIÁLOGO CONFIRMACIÓN: EDITAR ROLES */}
      <ConfirmDialog
        open={isConfirmEditRolesOpen}
        onClose={() => setIsConfirmEditRolesOpen(false)}
        onConfirm={handleConfirmEditRoles}
        isLoading={rolesMutation.isPending}
        title="Confirmar Actualización de Roles"
        description={`¿Estás seguro de guardar los roles [${editRoles.join(', ')}] para el usuario "${editingUser?.username}"? Esto modificará de inmediato sus permisos operativos.`}
        confirmText="Confirmar y Guardar"
        confirmColor="primary"
      />

      {/* NOTIFICACIONES MODALES SWEETALERT */}
      <SweetModal
        open={snackbar.open}
        type={snackbar.severity === 'error' ? 'error' : snackbar.severity === 'warning' ? 'warning' : 'success'}
        title={snackbar.severity === 'error' ? 'Error' : '¡Buen trabajo!'}
        description={snackbar.message}
        confirmText="OK"
        onConfirm={() => setSnackbar((prev) => ({ ...prev, open: false }))}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
      />
    </Container>
  );
}
